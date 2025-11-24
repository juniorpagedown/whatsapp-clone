// domain/services/conversation.service.js
const pool = require('../../infrastructure/database/postgres');
const cacheService = require('../../infrastructure/cache/cache.service');
const { AppError } = require('../../shared/errors/AppError');

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

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

const buildFilters = ({ search, tipo }) => {
  const filters = [];
  const values = [];

  if (search) {
    values.push(`%${search}%`);
    const idx = values.length;
    filters.push(`(
      (ct_data.nome ILIKE $${idx}) OR
      (ct_data.phone ILIKE $${idx}) OR
      (g_data.nome ILIKE $${idx}) OR
      (g_data.group_id ILIKE $${idx}) OR
      (c.chat_id ILIKE $${idx})
    )`);
  }

  if (tipo) {
    values.push(tipo);
    filters.push(`c.tipo = $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  return { whereClause, values };
};

const buildConversationQuery = ({
  whereClause,
  baseValues,
  isAuditada,
  limit,
  offset
}) => {
  const values = [...baseValues];
  const auditFlagIdx = values.length + 1;
  const appliedWhere = whereClause
    ? `${whereClause} AND c.is_auditada = $${auditFlagIdx}`
    : `WHERE c.is_auditada = $${auditFlagIdx}`;

  const limitIdx = auditFlagIdx + 1;
  const offsetIdx = auditFlagIdx + 2;

  values.push(isAuditada);
  values.push(limit);
  values.push(offset);

  const query = `
    WITH conversation_filtered AS (
      SELECT
        c.id,
        c.chat_id,
        c.tipo,
        c.ultima_mensagem,
        c.ultima_mensagem_timestamp,
        c.unread_count,
        c.is_archived,
        c.is_pinned,
        c.metadata,
        c.created_at,
        c.updated_at,
        c.is_auditada,
        c.auditada_em,
        c.auditada_por,
        usuario_auditada_por.nome AS auditada_por_nome,
        CASE
          WHEN auditoria_atual.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', auditoria_atual.id,
            'conversa_id', c.id,
            'started_at', auditoria_atual.data_inicio,
            'finalized_at', auditoria_atual.data_fim,
            'last_read_message_id', NULL,
            'auditor_user_id', auditoria_atual.usuario_id,
            'auditor_nome', auditoria_auditor.nome,
            'finalized_by', NULL,
            'finalized_by_nome', NULL,
            'notes', auditoria_atual.observacao,
            'status', auditoria_atual.status,
            'qtd_mensagens', auditoria_atual.qtd_mensagens,
            'metadata', auditoria_atual.metadata
          )
        END AS auditoria_atual_json,
        COALESCE((msg_stats).ultima_mensagem_timestamp, c.auditada_em, c.updated_at) AS last_activity,
        ct_data,
        g_data,
        participants_data.participants,
        msg_stats,
        COUNT(*) OVER() AS total_count
      FROM conversas c
      LEFT JOIN LATERAL (
        SELECT
          ct.id,
          ct.phone,
          ct.nome,
          ct.avatar,
          ct.profile_pic_url,
          ct.status_text,
          ct.metadata,
          ct.last_interaction
        FROM contatos ct
        WHERE ct.id = c.contato_id
      ) ct_data ON true
      LEFT JOIN LATERAL (
        SELECT
          g.id,
          g.group_id,
          -- Se o nome do grupo for igual ao group_id, tenta buscar do metadata da conversa
          CASE
            WHEN g.nome = g.group_id OR g.nome IS NULL OR LENGTH(TRIM(g.nome)) = 0
            THEN COALESCE(
              c.metadata->>'subject',
              c.metadata->>'chatName',
              g.nome,
              'Grupo Sem Nome'
            )
            ELSE g.nome
          END as nome,
          g.descricao,
          g.avatar,
          g.created_by,
          g.participant_count,
          g.metadata,
          g.updated_at
        FROM grupos g
        WHERE g.id = c.grupo_id
      ) g_data ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'id', gp.id,
          'contatoId', gp.contato_id,
          'isAdmin', gp.is_admin,
          'joinedAt', gp.joined_at,
          'leftAt', gp.left_at,
          'contato', json_build_object(
            'id', ct.id,
            'nome', ct.nome,
            'phone', ct.phone,
            'metadata', ct.metadata
          )
        ) ORDER BY gp.joined_at ASC) AS participants
        FROM grupo_participantes gp
      LEFT JOIN contatos ct ON ct.id = gp.contato_id
      WHERE gp.grupo_id = c.grupo_id
    ) participants_data ON true
      LEFT JOIN LATERAL (
        SELECT
          aud.id,
          aud.data_inicio,
          aud.data_fim,
          aud.usuario_id,
          aud.qtd_mensagens,
          aud.observacao,
          aud.status,
          aud.metadata
        FROM auditorias aud
        WHERE aud.conversa_id = c.id
        ORDER BY aud.data_fim DESC
        LIMIT 1
      ) auditoria_atual ON true
      LEFT JOIN usuarios auditoria_auditor ON auditoria_auditor.id = auditoria_atual.usuario_id
      LEFT JOIN usuarios usuario_auditada_por ON usuario_auditada_por.id = c.auditada_por
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS total_mensagens,
          MAX(m.timestamp) AS ultima_mensagem_timestamp,
          (
            SELECT row_to_json(lm)
            FROM (
              SELECT
                m2.id,
                m2.message_id,
                m2.tipo_mensagem,
                m2.texto,
                m2.media_url,
                m2.media_mime_type,
                m2.caption,
                m2.is_from_me,
                m2.timestamp,
                m2.status
              FROM mensagens m2
              WHERE m2.conversa_id = c.id
              ORDER BY m2.timestamp DESC
              LIMIT 1
            ) lm
          ) AS last_message
        FROM mensagens m
        WHERE m.conversa_id = c.id
      ) msg_stats ON true
      ${appliedWhere}
      ORDER BY
        COALESCE((msg_stats).ultima_mensagem_timestamp, c.auditada_em, c.updated_at) DESC NULLS LAST
      LIMIT $${limitIdx}
      OFFSET $${offsetIdx}
    )
    SELECT
      id,
      chat_id,
      tipo,
      ultima_mensagem,
      COALESCE((msg_stats).ultima_mensagem_timestamp, ultima_mensagem_timestamp) AS ultima_mensagem_timestamp,
      unread_count,
      is_archived,
      is_pinned,
      metadata,
      created_at,
      updated_at,
      is_auditada,
      auditada_em,
      auditada_por,
      auditada_por_nome,
      auditoria_atual_json,
      last_activity,
      row_to_json(ct_data) AS contato,
      row_to_json(g_data) AS grupo,
      participants AS participants,
      COALESCE((msg_stats).total_mensagens, 0) AS total_mensagens,
      (msg_stats).last_message,
      total_count
    FROM conversation_filtered;
  `;

  return { query, values };
};

const listConversations = async ({ search, tipo, limit, offset }) => {
  const safeLimit = sanitizeLimit(limit);
  const safeOffset = sanitizeOffset(offset);
  const cacheKey = cacheService.generateKey('conversas:list:recent', {
    search: search || null,
    tipo: tipo || null,
    limit: safeLimit,
    offset: safeOffset
  });

  const cachedResult = await cacheService.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  const { whereClause, values } = buildFilters({ search, tipo });
  const auditedQuery = buildConversationQuery({
    whereClause,
    baseValues: values,
    isAuditada: false,
    limit: safeLimit,
    offset: safeOffset
  });

  const nonAuditedQuery = buildConversationQuery({
    whereClause,
    baseValues: values,
    isAuditada: true,
    limit: safeLimit,
    offset: safeOffset
  });

  try {
    const [recentResult, auditedResult] = await Promise.all([
      pool.query(auditedQuery.query, auditedQuery.values),
      pool.query(nonAuditedQuery.query, nonAuditedQuery.values)
    ]);

    const rows = [
      ...recentResult.rows,
      ...auditedResult.rows
    ];

    const recentTotal = recentResult.rows.length
      ? Number(recentResult.rows[0].total_count)
      : 0;
    const auditedTotal = auditedResult.rows.length
      ? Number(auditedResult.rows[0].total_count)
      : 0;
    const total = recentTotal + auditedTotal;

    const result = {
      total,
      limit: safeLimit,
      offset: safeOffset,
      conversations: rows.map((row) => ({
        id: row.id,
        chatId: row.chat_id,
        tipo: row.tipo,
        ultimaMensagem: row.ultima_mensagem,
        ultimaMensagemTimestamp: row.ultima_mensagem_timestamp,
        unreadCount: row.unread_count,
        isArchived: row.is_archived,
        isPinned: row.is_pinned,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isAuditada: row.is_auditada,
        auditadaEm: row.auditada_em,
        auditadaPor: row.auditada_por,
        auditadaPorNome: row.auditada_por_nome,
        auditoriaAtual: row.auditoria_atual_json || null,
        lastActivityAt: row.last_activity,
        contato: row.contato,
        grupo: row.grupo,
        participants: row.participants || [],
        totalMensagens: Number(row.total_mensagens) || 0,
        lastMessage: row.last_message
      }))
    };

    await cacheService.set(cacheKey, result);

    return result;
  } catch (error) {
    const appError = new AppError('Erro ao listar conversas', 500);
    appError.details = { cause: error.message };
    throw appError;
  }
};

module.exports = {
  listConversations
};
