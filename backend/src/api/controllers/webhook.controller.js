// api/controllers/webhook.controller.js
const axios = require('axios');
const pool = require('../../infrastructure/database/postgres');
const logger = require('../../shared/config/logger.config');
const { AppError } = require('../../shared/errors/AppError');
const socketManager = require('../../infrastructure/websocket/socketManager');
const cacheService = require('../../infrastructure/cache/cache.service');
const {
  getMessageWithMetadataById,
  getMessageWithMetadataByMessageId
} = require('../../domain/services/message.service');
const { embeddingQueue, EMBEDDING_JOB } = require('../../infrastructure/queues/embedding.queue');

const normalizePhone = (jid) => {
  if (!jid) {
    return null;
  }
  const [raw] = `${jid}`.split('@');
  if (!raw) {
    return null;
  }
  const digits = raw.replace(/\D/g, '');
  return digits || raw;
};

const parseTimestamp = (value) => {
  if (!value) {
    return new Date();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric > 1e12) {
      return new Date(numeric);
    }
    return new Date(numeric * 1000);
  }

  return new Date();
};

const safeJson = (data) => {
  try {
    return data ? JSON.stringify(data) : null;
  } catch (error) {
    logger.warn('Não foi possível serializar metadata do webhook', { error: error.message });
    return null;
  }
};

const pickFirstString = (...values) => {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return null;
};

const {
  EVOLUTION_API_URL,
  EVOLUTION_API_KEY,
  EVOLUTION_INSTANCE
} = process.env;

const hasEvolutionIntegration = Boolean(
  EVOLUTION_API_URL &&
  EVOLUTION_API_KEY &&
  EVOLUTION_INSTANCE
);

const evolutionHttp = hasEvolutionIntegration
  ? axios.create({
    baseURL: EVOLUTION_API_URL,
    headers: { apikey: EVOLUTION_API_KEY },
    timeout: 12000
  })
  : null;

const contactCache = new Map();
const participantSyncCache = new Map();

const pickContactName = (payload) => pickFirstString(
  payload?.name,
  payload?.pushname,
  payload?.pushName,
  payload?.contactName,
  payload?.formattedName,
  payload?.notifyName,
  payload?.shortName,
  payload?.displayName,
  payload?.profileName,
  payload?.profile?.name
);

const pickContactAvatar = (payload) => pickFirstString(
  payload?.profilePicUrl,
  payload?.profilePicURL,
  payload?.profilePicture,
  payload?.profilePictureUrl,
  payload?.photoUrl,
  payload?.avatar,
  payload?.picture,
  payload?.image
);

const collectMentionLists = (source) => {
  if (!source) return [];
  const lists = [];

  const append = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      lists.push(value);
    } else {
      lists.push([value]);
    }
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
    if (normalized) {
      mentionsSet.add(normalized);
    }
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
    if (Array.isArray(list)) {
      list.forEach(register);
    } else {
      register(list);
    }
  });

  return Array.from(mentionsSet);
};

const normalizePhoneDigits = (value) => {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  return digits.length ? digits : null;
};

const fetchEvolutionContact = async (phone) => {
  if (!hasEvolutionIntegration) {
    return null;
  }

  const normalized = normalizePhoneDigits(phone);
  if (!normalized) {
    return null;
  }

  if (contactCache.has(normalized)) {
    return contactCache.get(normalized);
  }

  const candidateEndpoints = [
    `/contacts/findContact/${EVOLUTION_INSTANCE}/${normalized}`,
    `/contacts/getContact/${EVOLUTION_INSTANCE}/${normalized}`,
    `/contacts/getStatus/${EVOLUTION_INSTANCE}/${normalized}`
  ];

  for (const endpoint of candidateEndpoints) {
    try {
      const response = await evolutionHttp.get(endpoint);
      const payload = response?.data || null;
      if (!payload) continue;

      const source = payload?.contact || payload?.data || payload?.result || payload;
      if (!source) continue;

      const name = pickContactName(source);
      const avatar = pickContactAvatar(source);
      const waid = pickFirstString(
        source?.id,
        source?.wid,
        source?.jid,
        source?.user,
        source?.contactId,
        source?.waid
      );

      const resolved = {
        phone: normalizePhoneDigits(waid) || normalized,
        name: name || null,
        avatar: avatar || null,
        raw: source
      };

      contactCache.set(normalized, resolved);
      return resolved;
    } catch (error) {
      const status = error?.response?.status;
      const logLevel = status && status < 500 ? 'debug' : 'warn';
      logger[logLevel]('Evolution contact lookup falhou', {
        endpoint,
        phone: normalized,
        status,
        message: error.message
      });
    }
  }

  contactCache.set(normalized, null);
  return null;
};

const fetchGroupParticipantsFromEvolution = async (chatId) => {
  if (!hasEvolutionIntegration || !chatId) {
    return [];
  }

  const cacheKey = chatId;
  const cached = participantSyncCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached.participants;
  }

  const endpoints = [
    `/group/fetchParticipants/${EVOLUTION_INSTANCE}/${encodeURIComponent(chatId)}`,
    `/group/participants/${EVOLUTION_INSTANCE}/${encodeURIComponent(chatId)}`,
    `/group/fetchGroup/${EVOLUTION_INSTANCE}/${encodeURIComponent(chatId)}?getParticipants=true`
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await evolutionHttp.get(endpoint);
      const payload = response?.data || null;
      if (!payload) continue;

      let participants = [];

      if (Array.isArray(payload?.participants)) {
        participants = payload.participants;
      } else if (Array.isArray(payload)) {
        participants = payload;
      } else if (payload?.group && Array.isArray(payload.group.participants)) {
        participants = payload.group.participants;
      } else if (payload?.data?.participants && Array.isArray(payload.data.participants)) {
        participants = payload.data.participants;
      }

      if (!participants.length && Array.isArray(payload?.groups)) {
        const found = payload.groups.find((group) => group?.id === chatId || group?.groupId === chatId);
        if (found && Array.isArray(found.participants)) {
          participants = found.participants;
        }
      }

      if (!participants.length) {
        continue;
      }

      participantSyncCache.set(cacheKey, {
        timestamp: Date.now(),
        participants
      });

      return participants;
    } catch (error) {
      const status = error?.response?.status;
      const logLevel = status && status < 500 ? 'debug' : 'warn';
      logger[logLevel]('Evolution participants lookup falhou', {
        endpoint,
        chatId,
        status,
        message: error.message
      });
    }
  }

  participantSyncCache.set(cacheKey, {
    timestamp: Date.now(),
    participants: []
  });

  return [];
};

const resolveGroupName = ({ chatId, chatName, groupName, metadata }) => {
  if (!chatId && !chatName && !groupName) {
    return null;
  }

  const rawMetadata = metadata?.raw || {};

  // Lugares onde a Evolution API pode enviar o nome do grupo
  const candidateNames = [
    // Prioridade 1: subject direto no payload raiz (Evolution API v2)
    rawMetadata?.subject,
    metadata?.subject,

    // Prioridade 2: dentro de messageContextInfo (estrutura WhatsApp Web)
    rawMetadata?.messageContextInfo?.subject,
    rawMetadata?.message?.messageContextInfo?.subject,
    metadata?.messageContextInfo?.subject,

    // Prioridade 3: dentro de objetos group/groupData
    rawMetadata?.group?.subject,
    rawMetadata?.groupData?.subject,
    metadata?.group?.subject,
    metadata?.groupData?.subject,

    // Prioridade 4: outros campos name/title
    rawMetadata?.group?.name,
    rawMetadata?.groupData?.name,
    metadata?.group?.name,
    rawMetadata?.group?.title,

    // Prioridade 5: chatName/groupName recebidos como parâmetro
    chatName,
    groupName,
    metadata?.chatName,
    rawMetadata?.chatName,

    // Prioridade 6: name genérico
    rawMetadata?.name,
    metadata?.name
  ];

  // Filtrar e retornar o primeiro nome válido
  const validName = pickFirstString(...candidateNames);

  // Se o nome encontrado for igual ao chatId (é o JID), não é um nome real
  if (validName && validName !== chatId && !validName.includes('@g.us')) {
    return validName;
  }

  // Último recurso: retornar null para que seja usado o fallback padrão
  return null;
};

const ensureContact = async (client, { phone, nome, profilePicUrl, metadata, forceSync = false }) => {
  if (!phone) {
    return null;
  }

  let resolvedName = nome;
  let resolvedAvatar = profilePicUrl;
  let mergedMetadata = metadata || {};

  try {
    if (!resolvedName || resolvedName === phone || forceSync) {
      const remote = await fetchEvolutionContact(phone);
      if (remote) {
        resolvedName = pickFirstString(resolvedName, remote.name, phone);
        resolvedAvatar = resolvedAvatar || remote.avatar || null;
        mergedMetadata = {
          ...mergedMetadata,
          evolution: remote.raw || remote
        };
      }
    }
  } catch (error) {
    logger.warn('Falha ao obter contato na Evolution API', {
      phone,
      message: error.message
    });
  }

  if (!resolvedName) {
    resolvedName = phone;
  }

  const result = await client.query(
    `
      INSERT INTO contatos (phone, nome, profile_pic_url, metadata, updated_at, last_interaction)
      VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
      ON CONFLICT (phone)
      DO UPDATE SET
        nome = CASE
          WHEN EXCLUDED.nome IS NOT NULL AND EXCLUDED.nome <> '' THEN EXCLUDED.nome
          ELSE contatos.nome
        END,
        profile_pic_url = COALESCE(EXCLUDED.profile_pic_url, contatos.profile_pic_url),
        metadata = COALESCE(EXCLUDED.metadata, contatos.metadata),
        updated_at = NOW(),
        last_interaction = NOW()
      RETURNING id
    `,
    [
      phone,
      resolvedName,
      resolvedAvatar || null,
      safeJson(mergedMetadata)
    ]
  );

  return result.rows[0]?.id || null;
};

const ensureGroup = async (client, { groupId, nome, descricao, participantCount, metadata }) => {
  if (!groupId) {
    return null;
  }

  // Só atualiza o nome se o novo nome for válido (não vazio e diferente do group_id)
  const hasValidName = nome && nome !== groupId && nome.trim().length > 0;

  const result = await client.query(
    `
      INSERT INTO grupos (group_id, nome, descricao, participant_count, metadata, updated_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
      ON CONFLICT (group_id)
      DO UPDATE SET
        -- Atualiza o nome apenas se o novo nome for válido E (o nome atual for igual ao group_id OU estiver vazio)
        nome = CASE
          WHEN $2 IS NOT NULL AND $2 <> $1 AND LENGTH(TRIM($2)) > 0
               AND (grupos.nome = grupos.group_id OR grupos.nome IS NULL OR LENGTH(TRIM(grupos.nome)) = 0)
          THEN $2
          ELSE grupos.nome
        END,
        descricao = COALESCE(EXCLUDED.descricao, grupos.descricao),
        participant_count = COALESCE(EXCLUDED.participant_count, grupos.participant_count),
        metadata = COALESCE(EXCLUDED.metadata, grupos.metadata),
        updated_at = NOW()
      RETURNING id
    `,
    [groupId, nome || groupId, descricao || null, participantCount || null, safeJson(metadata)]
  );

  return result.rows[0]?.id || null;
};

const ensureGroupParticipant = async (client, { grupoId, contatoId, isAdmin }) => {
  if (!grupoId || !contatoId) {
    return;
  }

  await client.query(
    `
      INSERT INTO grupo_participantes (grupo_id, contato_id, is_admin, joined_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (grupo_id, contato_id)
      DO UPDATE SET
        is_admin = COALESCE(EXCLUDED.is_admin, grupo_participantes.is_admin),
        left_at = NULL
    `,
    [grupoId, contatoId, Boolean(isAdmin)]
  );
};

const syncGroupParticipants = async (client, { grupoId, chatId }) => {
  if (!grupoId || !chatId || !hasEvolutionIntegration) {
    return;
  }

  try {
    const existing = await client.query(
      `
        SELECT COUNT(*) AS total
          FROM grupo_participantes
         WHERE grupo_id = $1
      `,
      [grupoId]
    );

    const count = Number(existing.rows[0]?.total || 0);
    if (count >= 5 && participantSyncCache.has(chatId)) {
      // Já temos alguns participantes mapeados e cache recente
      return;
    }

    const remoteParticipants = await fetchGroupParticipantsFromEvolution(chatId);
    if (!Array.isArray(remoteParticipants) || remoteParticipants.length === 0) {
      return;
    }

    for (const participant of remoteParticipants) {
      const phone = normalizePhoneDigits(
        participant?.id ||
        participant?.wid ||
        participant?.user ||
        participant?.participant ||
        participant?.jid
      );

      if (!phone) {
        continue;
      }

      const resolvedName = pickContactName(participant) || participant?.shortName || phone;
      const avatar = pickContactAvatar(participant) || participant?.profilePicThumb || null;

      const contatoId = await ensureContact(client, {
        phone,
        nome: resolvedName,
        profilePicUrl: avatar,
        metadata: {
          participant,
          origem: 'evolution-sync'
        }
      });

      await ensureGroupParticipant(client, {
        grupoId,
        contatoId,
        isAdmin: Boolean(participant?.isAdmin || participant?.admin)
      });
    }
  } catch (error) {
    logger.warn('Falha ao sincronizar participantes do grupo', {
      chatId,
      grupoId,
      message: error.message
    });
  }
};

const ensureConversation = async (client, { chatId, tipo, contatoId, grupoId, ultimaMensagem, timestamp, metadata }) => {
  if (!chatId || !tipo) {
    return null;
  }

  const result = await client.query(
    `
      INSERT INTO conversas (
        chat_id,
        tipo,
        contato_id,
        grupo_id,
        ultima_mensagem,
        ultima_mensagem_timestamp,
        metadata,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
      ON CONFLICT (chat_id)
      DO UPDATE SET
        contato_id = COALESCE(EXCLUDED.contato_id, conversas.contato_id),
        grupo_id = COALESCE(EXCLUDED.grupo_id, conversas.grupo_id),
        ultima_mensagem = COALESCE(EXCLUDED.ultima_mensagem, conversas.ultima_mensagem),
        ultima_mensagem_timestamp = COALESCE(EXCLUDED.ultima_mensagem_timestamp, conversas.ultima_mensagem_timestamp),
        metadata = COALESCE(EXCLUDED.metadata, conversas.metadata),
        updated_at = NOW()
      RETURNING id
    `,
    [
      chatId,
      tipo,
      contatoId || null,
      grupoId || null,
      ultimaMensagem || null,
      timestamp,
      safeJson(metadata)
    ]
  );

  return result.rows[0]?.id || null;
};

const findMensagemId = async (client, messageId) => {
  if (!messageId) {
    return null;
  }

  const result = await client.query(
    `
      SELECT id
      FROM mensagens
      WHERE message_id = $1
    `,
    [messageId]
  );

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
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, NOW())
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
      safeJson(data.metadata)
    ]
  );

  return result.rows[0] || null;
};

const extractMessageData = (payload) => {
  const message = payload?.message || payload?.data || payload || {};

  // Extrair key que contém informações importantes
  const key = message.key || payload?.key || {};

  const chatId =
    key.remoteJid ||
    message.chatId ||
    message.remoteJid ||
    message.from ||
    message.to ||
    chatId;

  // Para grupos, priorizar o subject (nome do grupo) ao invés de pushName (nome do participante)
  const isGroupChat = Boolean(chatId && chatId.includes('@g.us'));

  // Evolution API envia o nome do grupo em vários lugares possíveis
  // Estrutura típica: data.message.messageContextInfo ou no nível raiz
  const chatName = isGroupChat
    ? (
       // Prioridade 1: subject direto no payload (Evolution API v2)
       payload?.subject ||
       message.subject ||
       // Prioridade 2: dentro de messageContextInfo (WhatsApp Web structure)
       message.messageContextInfo?.subject ||
       payload?.messageContextInfo?.subject ||
       // Prioridade 3: dentro de message
       message.message?.messageContextInfo?.subject ||
       // Prioridade 4: chatName como fallback
       payload?.chatName ||
       message.chatName ||
       // Prioridade 5: name genérico
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
       null
      );

  const isGroup = Boolean(
    message.isGroup ||
      (chatId && chatId.includes('@g.us')) ||
      payload?.type === 'GROUP'
  );

  const isFromMe = Boolean(
    message.fromMe ||
      message.isFromMe ||
      message.key?.fromMe ||
      payload?.direction === 'out'
  );

  const participantJid = isGroup
    ? message.participant ||
      message.author ||
      message.sender?.id ||
      message.contact?.id
    : isFromMe
    ? message.to ||
      message.remoteJid ||
      message.chatId ||
      payload?.to
    : message.from ||
      message.sender?.id ||
      message.contact?.id ||
      payload?.from;

  const senderName =
    message.senderName ||
    message.pushName ||
    message.notifyName ||
    message.contact?.name ||
    payload?.senderName ||
    null;

  const messageId =
    message.id ||
    message.messageId ||
    message.key?.id ||
    message.msgId ||
    payload?.id ||
    `evolution-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const text =
    message.body ||
    message.text ||
    message.message?.conversation ||
    message.caption ||
    message.text?.body ||
    message.content ||
    null;

  const quotedMessageId =
    message.quotedMsgId ||
    message.quoted?.id ||
    message.contextInfo?.stanzaId ||
    null;

  const timestamp =
    message.timestamp ||
    message.messageTimestamp ||
    message.time ||
    message.date ||
    Date.now();

  const tipoMensagem =
    message.type ||
    message.messageType ||
    (message.mediaUrl ? 'media' : 'text') ||
    'text';

  const mediaMimeType =
    message.mediaMimeType ||
    message.mimeType ||
    message.mimetype ||
    message.media?.mimetype ||
    null;

  const status =
    message.status ||
    (isFromMe ? 'sent' : 'received');

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
    metadata: {
      raw: payload
    }
  };
};

const parsePayload = (body) => {
  if (!body) {
    return [];
  }

  if (Array.isArray(body)) {
    return body;
  }

  if (Array.isArray(body.messages)) {
    return body.messages;
  }

  if (Array.isArray(body.data)) {
    return body.data;
  }

  if (body.message) {
    return [body];
  }

  return [body];
};

const handleEvolutionWebhook = async (req, res, next) => {
  try {
    const configuredToken = process.env.EVOLUTION_WEBHOOK_TOKEN;
    const allowWithoutToken = String(process.env.EVOLUTION_WEBHOOK_ALLOW_NO_TOKEN || '').toLowerCase() === 'true';

    if (configuredToken) {
      const incomingToken =
        req.headers['x-webhook-token'] ||
        req.headers['x-hook-secret'] ||
        req.headers['x-evolution-token'] ||
        req.headers['token'] ||
        (req.headers.authorization
          ? req.headers.authorization.replace(/^Bearer\s+/i, '').trim()
          : null) ||
        req.headers['apikey'] ||
        req.query.token ||
        req.query.secret ||
        req.body?.token ||
        req.body?.secret;

      if (!incomingToken) {
        if (allowWithoutToken) {
          logger.warn('Webhook Evolution: token ausente mas permitido por configuração', {
            headers: Object.keys(req.headers || {})
          });
        } else {
          logger.warn('Webhook Evolution: token inválido', {
            incomingToken: null,
            headers: Object.keys(req.headers || {})
          });
          throw new AppError('Webhook token inválido', 401);
        }
      } else if (incomingToken !== configuredToken) {
        logger.warn('Webhook Evolution: token inválido', {
          incomingToken: '***',
          headers: Object.keys(req.headers || {})
        });
        throw new AppError('Webhook token inválido', 401);
      }
    }

    const events = parsePayload(req.body);
    if (!events.length) {
      logger.debug('Webhook Evolution: payload vazio');
      return res.status(200).json({ received: false, reason: 'empty_payload' });
    }

    const client = await pool.connect();
    let processed = 0;
    const messagesToBroadcast = [];
    const embeddingJobs = [];
    const conversationsToInvalidate = new Set();

    try {
      await client.query('BEGIN');

      for (const event of events) {
        const parsed = extractMessageData(event);

        if (!parsed.contactName || parsed.contactName === parsed.contactPhone) {
          try {
            const remoteContact = await fetchEvolutionContact(parsed.contactPhone);
            if (remoteContact?.name) {
              parsed.contactName = remoteContact.name;
            }
          } catch (error) {
            logger.debug('Webhook Evolution: falha ao complementar nome do contato', {
              phone: parsed.contactPhone,
              message: error.message
            });
          }
        }

        if (!parsed.chatId) {
          logger.warn('Webhook Evolution: chatId ausente', { event });
          continue;
        }

        const conversationMetadata = {
          chatName: parsed.chatName,
          isGroup: parsed.isGroup
        };

        let contatoId = null;
        let grupoId = null;

        if (parsed.isGroup) {
          const groupMetadataSource = {
            chatName: parsed.chatName,
            group: parsed.metadata.raw?.group,
            groupData: parsed.metadata.raw?.groupData,
            chat: parsed.metadata.raw?.chat,
            raw: parsed.metadata.raw
          };

          const resolvedGroupName = resolveGroupName({
            chatId: parsed.chatId,
            chatName: parsed.chatName,
            groupName: parsed.groupName,
            metadata: groupMetadataSource
          });

          // Log detalhado para debug de nomes de grupos
          logger.debug('Webhook: Resolução de nome de grupo', {
            chatId: parsed.chatId,
            chatNameParsed: parsed.chatName,
            groupNameParsed: parsed.groupName,
            resolvedName: resolvedGroupName,
            metadata: {
              subject: groupMetadataSource?.raw?.subject,
              messageContextInfo: groupMetadataSource?.raw?.messageContextInfo?.subject,
              groupSubject: groupMetadataSource?.raw?.group?.subject
            }
          });

          conversationMetadata.chatName = resolvedGroupName;

          const groupMetadata = {
            chatName: parsed.chatName,
            group: groupMetadataSource.group,
            groupData: groupMetadataSource.groupData,
            chat: groupMetadataSource.chat
          };

          grupoId = await ensureGroup(client, {
            groupId: parsed.chatId,
            nome: resolvedGroupName || parsed.chatId,
            descricao:
              parsed.metadata.raw?.group?.description ||
              parsed.metadata.raw?.groupData?.description ||
              null,
            participantCount:
              parsed.metadata.raw?.group?.participants?.length ||
              parsed.metadata.raw?.groupData?.participants?.length ||
              null,
            metadata: groupMetadata
          });

          contatoId = await ensureContact(client, {
            phone: parsed.contactPhone,
            nome: parsed.contactName,
            profilePicUrl: pickContactAvatar(parsed.metadata?.raw?.participant),
            forceSync: !parsed.contactName,
            metadata: {
              participantJid: parsed.participantJid,
              fromGroup: parsed.chatId
            }
          });

          await ensureGroupParticipant(client, {
            grupoId,
            contatoId,
            isAdmin: parsed.metadata.raw?.isAdmin
          });

          await syncGroupParticipants(client, {
            grupoId,
            chatId: parsed.chatId
          });
        } else {
          contatoId = await ensureContact(client, {
            phone: parsed.contactPhone || normalizePhone(parsed.chatId),
            nome: parsed.contactName,
            forceSync: !parsed.contactName,
            metadata: {
              chatId: parsed.chatId
            }
          });
        }

        const mentionedPhones = extractMentionedPhones(parsed.metadata);
        if (mentionedPhones.length > 0) {
          const resolvedMentions = parsed.metadata.resolvedMentions || {};

          for (const phone of mentionedPhones) {
            try {
              const remote = await fetchEvolutionContact(phone);
              const resolvedName = remote?.name || null;

              const mentionContactId = await ensureContact(client, {
                phone,
                nome: resolvedName || phone,
                profilePicUrl: remote?.avatar,
                metadata: {
                  origem: 'mention',
                  evolution: remote?.raw || remote
                }
              });

              if (parsed.isGroup && grupoId && mentionContactId) {
                await ensureGroupParticipant(client, {
                  grupoId,
                  contatoId: mentionContactId,
                  isAdmin: false
                });
              }

              if (resolvedName) {
                resolvedMentions[phone] = resolvedName;
              }
            } catch (error) {
              logger.debug('Falha ao sincronizar contato mencionado', {
                phone,
                message: error.message
              });
            }
          }

          parsed.metadata.resolvedMentions = resolvedMentions;
        }

        const conversaId = await ensureConversation(client, {
          chatId: parsed.chatId,
          tipo: parsed.isGroup ? 'grupo' : 'individual',
          contatoId: parsed.isGroup ? null : contatoId,
          grupoId: parsed.isGroup ? grupoId : null,
          ultimaMensagem: parsed.text || parsed.caption || parsed.tipoMensagem,
          timestamp: parsed.timestamp,
          metadata: conversationMetadata
        });

        if (!conversaId) {
          logger.warn('Webhook Evolution: não foi possível obter conversa', { chatId: parsed.chatId });
          continue;
        }

        conversationsToInvalidate.add(conversaId);

        const quotedMessageDbId = parsed.quotedMessageId
          ? await findMensagemId(client, parsed.quotedMessageId)
          : null;

        const savedMessage = await saveMessage(client, {
          messageId: parsed.messageId,
          conversaId,
          contatoId,
          tipoMensagem: parsed.tipoMensagem || 'text',
          texto: parsed.text,
          mediaUrl: parsed.mediaUrl,
          mediaMimeType: parsed.mediaMimeType,
          caption: parsed.caption,
          isFromMe: parsed.isFromMe,
          isForwarded: parsed.isForwarded,
          quotedMessageId: quotedMessageDbId,
          timestamp: parsed.timestamp,
          status: parsed.status,
          metadata: parsed.metadata
        });

        await client.query(
          `
            UPDATE conversas
               SET is_auditada = FALSE,
                   auditada_em = NULL,
                   auditada_por = NULL,
                   updated_at = NOW()
             WHERE id = $1
          `,
          [conversaId]
        );

        conversationsToInvalidate.add(conversaId);

        if (savedMessage) {
          messagesToBroadcast.push({
            conversaId,
            messageId: savedMessage.id,
            messageExternalId: savedMessage.message_id
          });

          const embeddingText = parsed.text || parsed.caption || null;
          const hasEmbedding = savedMessage.embedding && String(savedMessage.embedding).trim().length > 0;

          if (!hasEmbedding && embeddingText && embeddingText.trim().length > 0) {
            embeddingJobs.push({
              messageId: savedMessage.id,
              texto: embeddingText
            });
          }
        }

        processed += 1;
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    if (conversationsToInvalidate.size > 0) {
      await Promise.all(
        Array.from(conversationsToInvalidate).map((id) =>
          cacheService.invalidateConversa(id)
        )
      );
    }

    if (embeddingJobs.length > 0) {
      try {
        await Promise.all(
          embeddingJobs.map((job) =>
            embeddingQueue.add(
              EMBEDDING_JOB.MESSAGE,
              job,
              { jobId: `message:${job.messageId}` }
            )
          )
        );
      } catch (error) {
        logger.error('Webhook: falha ao enfileirar embeddings', { error: error.message });
      }
    }

    for (const item of messagesToBroadcast) {
      const message =
        (await getMessageWithMetadataById(item.messageId)) ||
        (await getMessageWithMetadataByMessageId(item.messageExternalId));

      if (message) {
        socketManager.emitConversationMessage(item.conversaId, message);
      }
    }

    logger.info('Webhook Evolution: mensagens processadas', { processed });
    return res.status(200).json({ received: true, processed });
  } catch (error) {
    logger.error('Erro no webhook da Evolution API', { error: error.message });
    return next(error);
  }
};

module.exports = {
  handleEvolutionWebhook
};
