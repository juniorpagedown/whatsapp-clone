const logger = require('../../shared/config/logger.config');

const normalizePhone = (jid) => {
    if (!jid) return null;
    const [raw] = `${jid}`.split('@');
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '');
    return digits || raw;
};

const parseTimestamp = (value) => {
    if (!value) return new Date();
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) return new Date(parsed);
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
        if (numeric > 1e12) return new Date(numeric);
        return new Date(numeric * 1000);
    }
    return new Date();
};

const safeJson = (data) => {
    try {
        return data ? JSON.stringify(data) : null;
    } catch (error) {
        logger.warn('Não foi possível serializar metadata', { error: error.message });
        return null;
    }
};

const collectMentionLists = (source) => {
    if (!source) return [];
    const lists = [];
    const append = (value) => {
        if (!value) return;
        if (Array.isArray(value)) lists.push(value);
        else lists.push([value]);
    };
    append(source.mentions);
    append(source.mentionedJid);
    append(source.mentionedJidList);
    append(source.mentionedIds);
    append(source.mentionedJids);
    append(source.mentioned);
    append(source.mentiondJid);
    append(source.mentiondList);
    append(source.participantsList);
    return lists;
};

const normalizePhoneDigits = (value) => {
    if (!value) return null;
    const digits = String(value).replace(/\D/g, '');
    return digits.length ? digits : null;
};

const extractMentionedPhones = (metadata = {}) => {
    const raw = metadata.raw || {};
    const message = raw.message || {};
    const contextInfo = message.contextInfo || raw.contextInfo || raw.messageContextInfo || {};
    const extendedContext = message.extendedTextMessage?.contextInfo || {};
    const outerContext = raw.extendedTextMessage?.contextInfo || {};
    const mentionsSet = new Set();

    const register = (value) => {
        if (!value) return;
        if (Array.isArray(value)) {
            value.forEach(register);
            return;
        }
        if (typeof value === 'object') {
            const candidate = value?.jid || value?.id || value?.user || value?.participant || value?.waid || value?.wid || value?.phone;
            register(candidate);
            return;
        }
        const normalized = normalizePhoneDigits(value);
        if (normalized) mentionsSet.add(normalized);
    };

    const sources = [
        ...collectMentionLists(metadata),
        ...collectMentionLists(raw),
        ...collectMentionLists(message),
        ...collectMentionLists(contextInfo),
        ...collectMentionLists(extendedContext),
        ...collectMentionLists(outerContext)
    ];

    sources.forEach((list) => {
        if (!list) return;
        if (Array.isArray(list)) list.forEach(register);
        else register(list);
    });

    return Array.from(mentionsSet);
};

const extractMessageData = (payload) => {
    const message = payload?.message || payload?.data || payload || {};
    const key = message.key || payload?.key || {};
    const chatId = key.remoteJid || message.chatId || message.remoteJid || message.from || message.to || null;
    const isGroupChat = Boolean(chatId && chatId.includes('@g.us'));

    const chatName = isGroupChat
        ? (
            payload?.subject ||
            message.subject ||
            message.messageContextInfo?.subject ||
            payload?.messageContextInfo?.subject ||
            message.message?.messageContextInfo?.subject ||
            payload?.chatName ||
            message.chatName ||
            message.name ||
            payload?.name ||
            null
        )
        : (
            payload?.chatName ||
            message.chatName ||
            message.subject ||
            message.name ||
            message.pushName ||
            message.contact?.name ||
            payload?.senderName ||
            null
        );

    const isGroup = Boolean(message.isGroup || (chatId && chatId.includes('@g.us')) || payload?.type === 'GROUP');
    const isFromMe = Boolean(message.fromMe || message.isFromMe || message.key?.fromMe || payload?.direction === 'out');

    const participantJid = isGroup
        ? message.participant || message.author || message.sender?.id || message.contact?.id
        : isFromMe
            ? message.to || message.remoteJid || message.chatId || payload?.to
            : message.from || message.sender?.id || message.contact?.id || payload?.from;

    const senderName = message.senderName || message.pushName || message.notifyName || message.contact?.name || payload?.senderName || null;
    const messageId = message.id || message.messageId || message.key?.id || message.msgId || payload?.id || `evolution-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const extendedText = message.message?.extendedTextMessage?.text || message.extendedTextMessage?.text || message.message?.extendedTextMessage?.caption || message.extendedTextMessage?.caption || null;
    const text = message.body || message.text || message.message?.conversation || extendedText || message.caption || message.message?.imageMessage?.caption || message.text?.body || message.content || null;
    const quotedMessageId = message.quotedMsgId || message.quoted?.id || message.contextInfo?.stanzaId || null;
    const timestamp = message.timestamp || message.messageTimestamp || message.time || message.date || Date.now();
    const tipoMensagem = message.type || message.messageType || (message.mediaUrl ? 'media' : 'text') || 'text';
    const mediaMimeType = message.mediaMimeType || message.mimeType || message.mimetype || message.media?.mimetype || null;
    const status = message.status || (isFromMe ? 'sent' : 'received');

    return {
        messageId,
        chatId,
        chatName,
        isGroup,
        isFromMe,
        participantJid,
        contactPhone: normalizePhone(participantJid || (isGroup ? message.author : chatId)),
        contactName: senderName,
        groupName: chatName,
        text,
        tipoMensagem,
        mediaUrl: message.mediaUrl || message.url || message.fileUrl || null,
        mediaMimeType,
        caption: message.caption || null,
        isForwarded: Boolean(message.isForwarded),
        quotedMessageId,
        timestamp: parseTimestamp(timestamp),
        status,
        metadata: { raw: payload }
    };
};

const findMensagemId = async (client, messageId) => {
    if (!messageId) return null;
    const result = await client.query('SELECT id FROM mensagens WHERE message_id = $1', [messageId]);
    return result.rows[0]?.id || null;
};

const saveMessage = async (client, data) => {
    const result = await client.query(
        `
      INSERT INTO mensagens (
        message_id,
        conversa_id,
        contato_id,
        tipo_mensagem,
        texto,
        media_url,
        media_mime_type,
        caption,
        is_from_me,
        is_forwarded,
        quoted_message_id,
        timestamp,
        status,
        metadata,
        created_at,
        instance_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, NOW(), $15)
      ON CONFLICT (message_id)
      DO UPDATE SET
        status = COALESCE(EXCLUDED.status, mensagens.status),
        metadata = COALESCE(EXCLUDED.metadata, mensagens.metadata)
      RETURNING *
    `,
        [
            data.messageId,
            data.conversaId,
            data.contatoId || null,
            data.tipoMensagem,
            data.texto || null,
            data.mediaUrl || null,
            data.mediaMimeType || null,
            data.caption || null,
            data.isFromMe,
            data.isForwarded,
            data.quotedMessageId || null,
            data.timestamp,
            data.status || null,
            safeJson(data.metadata),
            data.instanceId
        ]
    );

    return result.rows[0] || null;
};

module.exports = {
    extractMessageData,
    extractMentionedPhones,
    findMensagemId,
    saveMessage,
    normalizePhone
};
