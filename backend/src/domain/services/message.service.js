// domain/services/message.service.js
const axios = require('axios');
const pool = require('../../infrastructure/database/postgres');
const cacheService = require('../../infrastructure/cache/cache.service');
const logger = require('../../shared/config/logger.config');
const { AppError } = require('../../shared/errors/AppError');
const socketManager = require('../../infrastructure/websocket/socketManager');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const sanitizeLimit = (value) => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
};

const sanitizeOffset = (value) => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
};

const ensureContact = async (client, { phone, nome }) => {
  if (!phone) {
    return null;
  }

  const result = await client.query(
    `
      INSERT INTO contatos (phone, nome, updated_at, last_interaction)
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (phone)
      DO UPDATE SET
        nome = CASE
          WHEN EXCLUDED.nome IS NOT NULL AND EXCLUDED.nome <> '' THEN EXCLUDED.nome
          ELSE contatos.nome
        END,
        updated_at = NOW(),
        last_interaction = NOW()
      RETURNING id
    `,
    [phone, nome || phone]
  );

  return result.rows[0]?.id || null;
};

const ensureConversation = async (client, { chatId, tipo, contatoId }) => {
  const existing = await client.query(
    `
      SELECT id, tipo, contato_id
      FROM conversas
      WHERE chat_id = $1
      FOR UPDATE
    `,
    [chatId]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const result = await client.query(
    `
      INSERT INTO conversas (
        chat_id,
        tipo,
        contato_id,
        ultima_mensagem,
        ultima_mensagem_timestamp,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, NULL, NULL, NOW(), NOW())
      RETURNING id
    `,
    [chatId, tipo, contatoId || null]
  );

  return result.rows[0].id;
};

const MESSAGE_WITH_METADATA = `
  SELECT
    m.id,
    m.message_id,
    m.conversa_id,
    conv.chat_id,
    m.contato_id,
    m.tipo_mensagem,
    m.texto,
    m.media_url,
    m.media_mime_type,
    m.caption,
    m.is_from_me,
    m.is_forwarded,
    m.timestamp,
    m.status,
    m.metadata,
    m.created_at,
    contact.nome AS remetente_nome,
    contact.phone AS remetente_phone
  FROM mensagens m
  JOIN conversas conv ON conv.id = m.conversa_id
  LEFT JOIN contatos contact ON m.contato_id = contact.id
  WHERE m.id = $1
`;

const mapRowToMessageDto = (row) => {
  if (!row) {
    return null;
  }

  const createdAt = row.timestamp || row.created_at || new Date();
  const createdAtIso = createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString();

  let senderName = row.remetente_nome;
  let senderPhone = row.remetente_phone;

  if (!senderName || !senderPhone) {
    let metadata = row.metadata;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = null;
      }
    }
    const raw = metadata?.raw || metadata || {};
    const rawData = raw?.data || {};
    const rawMessage = raw?.message || rawData?.message || {};
    const rawContext = raw?.messageContextInfo || rawData?.messageContextInfo || {};

    if (!senderPhone) {
      senderPhone =
        rawData?.participantPn ||
        rawData?.key?.participantPn ||
        rawData?.key?.participant ||
        rawMessage?.participantPn ||
        rawMessage?.participant ||
        rawContext?.participantPn ||
        rawContext?.participant ||
        raw?.message?.participant ||
        raw?.participant?.id ||
        raw?.participant ||
        raw?.author ||
        null;
    }

    if (!senderName) {
      const senderNameCandidates = [
        rawData?.pushName,
        rawData?.senderName,
        rawData?.notifyName,
        rawData?.contact?.name,
        rawData?.profile?.name,
        rawData?.participant?.name,
        raw?.senderName,
        raw?.pushName,
        raw?.name,
        raw?.contact?.name,
        raw?.message?.senderName,
        raw?.message?.pushName,
        raw?.message?.notifyName,
        raw?.message?.contact?.name,
        raw?.contact?.name,
        raw?.participant?.name,
        raw?.metadata?.senderName,
        rawMessage?.pushName,
        rawMessage?.senderName,
        rawMessage?.notifyName,
        rawMessage?.contact?.name,
        senderPhone
      ];
      senderName = senderNameCandidates.find((value) => typeof value === 'string' && value.trim().length > 0) || 'Participante';
    }
  }

  return {
    id: row.id,
    messageId: row.message_id,
    conversationId: row.conversa_id,
    chatId: row.chat_id,
    from: row.is_from_me ? 'me' : senderPhone,
    senderName: row.is_from_me ? 'Você' : senderName || 'Participante',
    senderPhone,
    texto: row.texto,
    tipo: row.tipo_mensagem,
    mediaUrl: row.media_url,
    mediaMimeType: row.media_mime_type,
    caption: row.caption,
    isFromMe: row.is_from_me,
    isForwarded: row.is_forwarded,
    status: row.status,
    metadata: row.metadata,
    createdAt: createdAtIso
  };
};

const getMessageWithMetadataById = async (messageId) => {
  if (!messageId) {
    return null;
  }
  const { rows } = await pool.query(MESSAGE_WITH_METADATA, [messageId]);
  return mapRowToMessageDto(rows[0]);
};

const getMessageWithMetadataByMessageId = async (messageExternalId) => {
  if (!messageExternalId) {
    return null;
  }
  const { rows } = await pool.query(
    MESSAGE_WITH_METADATA.replace('m.id = $1', 'm.message_id = $1'),
    [messageExternalId]
  );
  return mapRowToMessageDto(rows[0]);
};

const listMessagesByConversation = async (conversationId, { limit, offset }) => {
  const safeLimit = sanitizeLimit(limit);
  const safeOffset = sanitizeOffset(offset);

  const query = `
    SELECT
      m.id,
      m.message_id,
      m.conversa_id,
      conv.chat_id,
      m.contato_id,
      m.tipo_mensagem,
      m.texto,
      m.media_url,
      m.media_mime_type,
      m.caption,
      m.is_from_me,
      m.is_forwarded,
      m.timestamp,
      m.status,
      m.metadata,
      contact.nome AS remetente_nome,
      contact.phone AS remetente_phone
    FROM mensagens m
    JOIN conversas conv ON conv.id = m.conversa_id
    LEFT JOIN contatos contact ON m.contato_id = contact.id
    WHERE m.conversa_id = $1
    ORDER BY m.timestamp ASC, m.id ASC
    LIMIT $2 OFFSET $3
  `;

  const { rows } = await pool.query(query, [conversationId, safeLimit, safeOffset]);
  return rows.map(mapRowToMessageDto);
};

const listMessagesByChatId = async ({ chatId, limit, before }) => {
  if (!chatId) {
    throw new AppError('chatId é obrigatório', 400);
  }

  const safeLimit = sanitizeLimit(limit);
  const normalizedChatId = chatId.trim();

  const params = [normalizedChatId];
  let beforeClause = '';
  if (before) {
    const beforeDate = new Date(before);
    if (!Number.isNaN(beforeDate.getTime())) {
      params.push(beforeDate.toISOString());
      beforeClause = `AND m.timestamp < $${params.length}`;
    }
  }

  params.push(safeLimit);

  const query = `
    SELECT
      m.id,
      m.message_id,
      m.conversa_id,
      conv.chat_id,
      m.contato_id,
      m.tipo_mensagem,
      m.texto,
      m.media_url,
      m.media_mime_type,
      m.caption,
      m.is_from_me,
      m.is_forwarded,
      m.timestamp,
      m.status,
      m.metadata,
      contact.nome AS remetente_nome,
      contact.phone AS remetente_phone
    FROM mensagens m
    JOIN conversas conv ON conv.id = m.conversa_id
    LEFT JOIN contatos contact ON m.contato_id = contact.id
    WHERE conv.chat_id = $1
      ${beforeClause}
    ORDER BY m.timestamp DESC, m.id DESC
    LIMIT $${params.length}
  `;

  const { rows } = await pool.query(query, params);
  const messages = rows.map(mapRowToMessageDto);
  const sorted = [...messages].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const hasMore = rows.length === safeLimit;
  const nextCursor = sorted.length ? sorted[0].createdAt : null;

  return {
    messages: sorted,
    hasMore,
    nextCursor,
    limit: safeLimit
  };
};

const sendTextMessage = async ({ chatId, texto, phone }) => {
  if (!chatId || !texto) {
    throw new AppError('Parâmetros obrigatórios ausentes', 400);
  }

  const evolutionUrl = process.env.EVOLUTION_API_URL;
  const evolutionKey = process.env.EVOLUTION_API_KEY;
  const evolutionInstance = process.env.EVOLUTION_INSTANCE;

  if (!evolutionUrl || !evolutionKey || !evolutionInstance) {
    throw new AppError('Evolution API não configurada', 500);
  }

  const isGroup = chatId.includes('@g.us');
  const normalizedPhone = phone || chatId.replace(/@.*/, '');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let contatoId = null;
    if (!isGroup) {
      contatoId = await ensureContact(client, { phone: normalizedPhone });
    }

    const conversaId = await ensureConversation(client, {
      chatId,
      tipo: isGroup ? 'grupo' : 'individual',
      contatoId
    });

    const payload = isGroup
      ? { groupId: chatId, text: texto }
      : { number: normalizedPhone, text: texto };

    let externalResponse;
    try {
      externalResponse = await axios.post(
        `${evolutionUrl}/message/sendText/${evolutionInstance}`,
        payload,
        {
          headers: {
            apikey: evolutionKey,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );
    } catch (error) {
      logger.error('Evolution API: erro ao enviar mensagem', {
        message: error.message,
        response: error.response?.data
      });
      throw new AppError('Falha ao enviar mensagem pela Evolution API', 502);
    }

    const externalMessageId =
      externalResponse?.data?.key?.id ||
      externalResponse?.data?.message?.id ||
      externalResponse?.data?.data?.id ||
      `local-${Date.now()}`;

    const insertResult = await client.query(
      `
        INSERT INTO mensagens (
          message_id,
          conversa_id,
          contato_id,
          tipo_mensagem,
          texto,
          is_from_me,
          timestamp,
          status,
          metadata,
          created_at
        )
        VALUES ($1, $2, $3, 'text', $4, TRUE, NOW(), $5, $6::jsonb, NOW())
        RETURNING *
      `,
      [
        externalMessageId,
        conversaId,
        contatoId,
        texto,
        externalResponse?.data?.status || 'sent',
        JSON.stringify({
          evolutionResponse: externalResponse?.data || null
        })
      ]
    );

    await client.query(
      `
        UPDATE conversas
        SET ultima_mensagem = $1,
            ultima_mensagem_timestamp = NOW(),
            updated_at = NOW(),
            unread_count = 0,
            is_auditada = FALSE,
            auditada_em = NULL,
            auditada_por = NULL
        WHERE id = $2
      `,
      [texto, conversaId]
    );

    const mensagem = insertResult.rows[0];
    await client.query('COMMIT');

    await cacheService.invalidateConversa(conversaId);

    const enrichedMessage = await getMessageWithMetadataById(mensagem.id);
    const messagePayload = enrichedMessage || mapRowToMessageDto({ ...mensagem, chat_id: chatId, conversa_id: conversaId });

    socketManager.emitConversationMessage(conversaId, messagePayload);
    logger.info('Mensagem enviada com sucesso', { conversaId, mensagemId: mensagem.id });

    return {
      mensagem: messagePayload,
      conversaId,
      externalResponse: externalResponse?.data
    };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AppError) {
      throw error;
    }

    logger.error('Erro ao enviar mensagem', { error: error.message });
    throw new AppError('Erro interno ao enviar mensagem', 500);
  } finally {
    client.release();
  }
};

module.exports = {
  listMessagesByConversation,
  listMessagesByChatId,
  sendTextMessage,
  getMessageWithMetadataById,
  getMessageWithMetadataByMessageId
};
