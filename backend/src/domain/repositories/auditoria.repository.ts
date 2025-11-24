// domain/repositories/auditoria.repository.ts
const pool = require('../../infrastructure/database/postgres');
const logger = require('../../shared/config/logger.config');
const {
  NotFoundError,
  AppError
} = require('../../shared/errors/AppError');
const cacheService = require('../../infrastructure/cache/cache.service');

const withTransaction = async (handler) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const parseJsonSafe = (value, fallback) => {
  if (value === null || typeof value === 'undefined') {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    logger.warn('Falha ao converter JSON', { value, error: error.message });
    return fallback;
  }
};

const mapConversation = (row) => {
  if (!row) return null;
  return {
    id: row.conversa_id,
    chatId: row.conversa_chat_id || null,
    tipo: row.conversa_tipo || null,
    nome: row.conversa_nome || null,
    grupoId: row.conversa_grupo_id || null,
    contatoId: row.conversa_contato_id || null,
    ultimaMensagem: row.conversa_ultima_mensagem || null,
    ultimaMensagemTimestamp: row.conversa_ultima_mensagem_timestamp || null
  };
};

const mapUsuario = (row) => {
  if (!row || !row.usuario_id) return null;
  return {
    id: row.usuario_id,
    nome: row.usuario_nome || null,
    email: row.usuario_email || null
  };
};

const mapAuditoriaRow = (row) => {
  if (!row) return null;

  return {
    id: row.id,
    conversaId: row.conversa_id,
    conversa: mapConversation(row),
    dataInicio: row.data_inicio,
    dataFim: row.data_fim,
    usuarioId: row.usuario_id,
    usuario: mapUsuario(row),
    qtdMensagens: Number(row.qtd_mensagens || 0),
    observacao: row.observacao || null,
    status: row.status,
    metadata: parseJsonSafe(row.metadata, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const resolveSenderInfo = (row, metadata) => {
  if (row.is_from_me) {
    return {
      senderName: 'Você',
      senderPhone: null
    };
  }

  let senderName = row.remetente_nome;
  let senderPhone = row.remetente_phone;

  const safeMetadata = metadata || {};
  const raw = safeMetadata.raw || safeMetadata || {};
  const rawData = raw.data || {};
  const rawMessage = raw.message || rawData.message || {};
  const rawContext = raw.messageContextInfo || rawData.messageContextInfo || {};

  if (!senderPhone) {
    senderPhone =
      rawData.participantPn ||
      rawData.key?.participantPn ||
      rawData.key?.participant ||
      rawMessage.participantPn ||
      rawMessage.participant ||
      rawContext.participantPn ||
      rawContext.participant ||
      raw.message?.participant ||
      raw.participant?.id ||
      raw.participant ||
      raw.author ||
      null;
  }

  if (!senderName) {
    const candidates = [
      rawData.pushName,
      rawData.senderName,
      rawData.notifyName,
      rawData.contact?.name,
      rawData.profile?.name,
      rawData.participant?.name,
      raw.senderName,
      raw.pushName,
      raw.name,
      raw.contact?.name,
      raw.message?.senderName,
      raw.message?.pushName,
      raw.message?.notifyName,
      raw.message?.contact?.name,
      raw.metadata?.senderName,
      rawMessage.pushName,
      rawMessage.senderName,
      rawMessage.notifyName,
      rawMessage.contact?.name,
      senderPhone
    ];

    senderName = candidates.find((value) => typeof value === 'string' && value.trim().length > 0) || null;
  }

  return {
    senderName: senderName || senderPhone || 'Participante',
    senderPhone: senderPhone || null
  };
};

const mapMensagemRow = (row) => {
  const metadata = parseJsonSafe(row.metadata, {});
  const { senderName, senderPhone } = resolveSenderInfo(row, metadata);

  return {
    id: row.id,
    messageId: row.message_id || null,
    conversaId: row.conversa_id,
    contatoId: row.contato_id || null,
    tipoMensagem: row.tipo_mensagem,
    texto: row.texto || null,
    mediaUrl: row.media_url || null,
    mediaMimeType: row.media_mime_type || null,
    caption: row.caption || null,
    isFromMe: row.is_from_me,
    timestamp: row.timestamp,
    status: row.status || null,
    metadata,
    senderName,
    senderPhone,
    classificacoes: Array.isArray(row.classificacoes)
      ? row.classificacoes
      : parseJsonSafe(row.classificacoes, [])
  };
};

const listRecentConversations = async ({ limit, offset }) => {
  const query = `
    WITH base AS (
      SELECT
        c.id AS conversa_id,
        c.chat_id AS conversa_chat_id,
        c.tipo AS conversa_tipo,
        c.grupo_id AS conversa_grupo_id,
        c.contato_id AS conversa_contato_id,
        c.ultima_mensagem AS conversa_ultima_mensagem,
        c.ultima_mensagem_timestamp AS conversa_ultima_mensagem_timestamp,
        COALESCE(g.nome, ct.nome, c.chat_id) AS conversa_nome,
        COALESCE(uapc.ultima_data_fim, c.created_at) AS periodo_inicio,
        MAX(m.timestamp) AS ultima_mensagem_timestamp,
        COUNT(*) FILTER (
          WHERE m.timestamp > COALESCE(uapc.ultima_data_fim, c.created_at)
        ) AS novas_no_periodo
      FROM conversas c
      JOIN mensagens m ON m.conversa_id = c.id
      LEFT JOIN view_ultima_auditoria_por_conversa uapc ON uapc.conversa_id = c.id
      LEFT JOIN grupos g ON g.id = c.grupo_id
      LEFT JOIN contatos ct ON ct.id = c.contato_id
      GROUP BY
        c.id,
        c.chat_id,
        c.tipo,
        c.grupo_id,
        c.contato_id,
        c.ultima_mensagem,
        c.ultima_mensagem_timestamp,
        COALESCE(uapc.ultima_data_fim, c.created_at),
        g.nome,
        ct.nome
      HAVING MAX(m.timestamp) > COALESCE(uapc.ultima_data_fim, c.created_at)
    )
    SELECT
      *,
      COUNT(*) OVER() AS total_count
    FROM base
    ORDER BY ultima_mensagem_timestamp DESC
    LIMIT $1 OFFSET $2
  `;

  const { rows } = await pool.query(query, [limit, offset]);
  const total = rows.length ? Number(rows[0].total_count) : 0;

  return {
    total,
    items: rows.map((row) => ({
      conversa: mapConversation(row),
      periodoInicio: row.periodo_inicio,
      ultimaMensagem: row.ultima_mensagem_timestamp,
      novasNoPeriodo: Number(row.novas_no_periodo || 0)
    }))
  };
};

const listNonAuditedConversations = async ({ limit, offset, tipo }) => {
  const conditions = ['c.is_auditada = FALSE'];
  const values = [];

  if (tipo) {
    values.push(tipo);
    conditions.push(`c.tipo = $${values.length}`);
  }

  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const query = `
    WITH base AS (
      SELECT
        c.id AS conversa_id,
        c.chat_id AS conversa_chat_id,
        c.tipo AS conversa_tipo,
        c.grupo_id AS conversa_grupo_id,
        c.contato_id AS conversa_contato_id,
        c.ultima_mensagem AS conversa_ultima_mensagem,
        c.ultima_mensagem_timestamp AS conversa_ultima_mensagem_timestamp,
        c.created_at AS conversa_created_at,
        COALESCE(g.nome, ct.nome, c.chat_id) AS conversa_nome,
        COALESCE(uapc.ultima_data_fim, c.created_at) AS periodo_inicio,
        MAX(m.timestamp) AS ultima_mensagem_timestamp,
        COUNT(m.id) FILTER (
          WHERE m.timestamp > COALESCE(uapc.ultima_data_fim, c.created_at)
        ) AS novas_no_periodo
      FROM conversas c
      LEFT JOIN mensagens m ON m.conversa_id = c.id
      LEFT JOIN view_ultima_auditoria_por_conversa uapc ON uapc.conversa_id = c.id
      LEFT JOIN grupos g ON g.id = c.grupo_id
      LEFT JOIN contatos ct ON ct.id = c.contato_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY
        c.id,
        c.chat_id,
        c.tipo,
        c.grupo_id,
        c.contato_id,
        c.ultima_mensagem,
        c.ultima_mensagem_timestamp,
        c.created_at,
        COALESCE(uapc.ultima_data_fim, c.created_at),
        g.nome,
        ct.nome
    )
    SELECT
      *,
      COUNT(*) OVER() AS total_count
    FROM base
    ORDER BY COALESCE(ultima_mensagem_timestamp, conversa_created_at) DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const { rows } = await pool.query(query, values);
  const total = rows.length ? Number(rows[0].total_count) : 0;

  return {
    total,
    items: rows.map((row) => ({
      conversa: mapConversation(row),
      periodoInicio: row.periodo_inicio,
      ultimaMensagem: row.ultima_mensagem_timestamp,
      novasNoPeriodo: Number(row.novas_no_periodo || 0)
    }))
  };
};

const getConversationPeriod = async (conversaId, referenceDate) => {
  const query = `
    SELECT
      c.id AS conversa_id,
      c.chat_id AS conversa_chat_id,
      c.tipo AS conversa_tipo,
      c.grupo_id AS conversa_grupo_id,
      c.contato_id AS conversa_contato_id,
      c.ultima_mensagem AS conversa_ultima_mensagem,
      c.ultima_mensagem_timestamp AS conversa_ultima_mensagem_timestamp,
      COALESCE(g.nome, ct.nome, c.chat_id) AS conversa_nome,
      COALESCE(uapc.ultima_data_fim, c.created_at) AS periodo_base_inicio,
      aud_reaberta.id AS auditoria_reaberta_id,
      aud_reaberta.data_inicio AS auditoria_reaberta_inicio,
      aud_reaberta.data_fim AS auditoria_reaberta_fim,
      COUNT(m.id) AS total_mensagens
    FROM conversas c
    LEFT JOIN view_ultima_auditoria_por_conversa uapc
      ON uapc.conversa_id = c.id
    LEFT JOIN LATERAL (
      SELECT
        aud.id,
        aud.data_inicio,
        aud.data_fim
      FROM auditorias aud
      WHERE aud.conversa_id = c.id
        AND aud.status = 'reaberta'
      ORDER BY aud.created_at DESC
      LIMIT 1
    ) aud_reaberta ON true
    LEFT JOIN mensagens m
      ON m.conversa_id = c.id
     AND (
       (
         aud_reaberta.id IS NOT NULL
         AND m.timestamp >= aud_reaberta.data_inicio
         AND m.timestamp <= COALESCE(aud_reaberta.data_fim, $2::timestamp)
       )
       OR (
         aud_reaberta.id IS NULL
         AND m.timestamp > COALESCE(uapc.ultima_data_fim, c.created_at)
         AND m.timestamp <= $2::timestamp
       )
     )
    LEFT JOIN grupos g ON g.id = c.grupo_id
    LEFT JOIN contatos ct ON ct.id = c.contato_id
    WHERE c.id = $1
    GROUP BY
      c.id,
      c.chat_id,
      c.tipo,
      c.grupo_id,
      c.contato_id,
      c.ultima_mensagem,
      c.ultima_mensagem_timestamp,
      COALESCE(uapc.ultima_data_fim, c.created_at),
      aud_reaberta.id,
      aud_reaberta.data_inicio,
      aud_reaberta.data_fim,
      g.nome,
      ct.nome
  `;

  const { rows } = await pool.query(query, [conversaId, referenceDate]);
  const row = rows[0];

  if (!row) {
    throw new NotFoundError('Conversa não encontrada');
  }

  const hasReopenedAudit = Boolean(row.auditoria_reaberta_id);
  const periodoInicio = hasReopenedAudit
    ? row.auditoria_reaberta_inicio
    : row.periodo_base_inicio;
  const periodoFimPreview = hasReopenedAudit
    ? (row.auditoria_reaberta_fim || referenceDate)
    : referenceDate;

  return {
    conversa: mapConversation(row),
    periodoInicio,
    periodoFimPreview,
    totalMensagens: Number(row.total_mensagens || 0),
    auditoriaReabertaId: row.auditoria_reaberta_id || null,
    auditoriaReabertaInicio: row.auditoria_reaberta_inicio || null,
    auditoriaReabertaFim: row.auditoria_reaberta_fim || null
  };
};

const listPeriodMessages = async (conversaId, periodoInicio, periodoFim, { limit, offset }) => {
  if (!periodoInicio || !periodoFim) {
    throw new AppError('Período inválido para listagem de mensagens');
  }

  const query = `
    SELECT
      m.id,
      m.message_id,
      m.conversa_id,
      m.contato_id,
      m.tipo_mensagem,
      m.texto,
      m.media_url,
      m.media_mime_type,
      m.caption,
      m.is_from_me,
      m.timestamp,
      m.status,
      m.metadata,
      COALESCE(mc.data, '[]'::jsonb) AS classificacoes,
      COUNT(*) OVER() AS total_count
    FROM mensagens m
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', mc.id,
          'macro', mc.macro,
          'item', mc.item,
          'comentario', mc.observacoes,
          'criado_por', mc.criado_por,
          'created_at', mc.created_at
        ) ORDER BY mc.created_at DESC
      ) AS data
      FROM mensagem_classificacao mc
      WHERE mc.mensagem_id = m.id
    ) mc ON TRUE
    WHERE m.conversa_id = $1
      AND m.timestamp > $2::timestamp
      AND m.timestamp <= $3::timestamp
    ORDER BY m.timestamp ASC, m.id ASC
    LIMIT $4 OFFSET $5
  `;

  const { rows } = await pool.query(query, [
    conversaId,
    periodoInicio,
    periodoFim,
    limit,
    offset
  ]);

  const total = rows.length ? Number(rows[0].total_count) : 0;

  return {
    total,
    items: rows.map(mapMensagemRow)
  };
};

const insertAuditoria = async ({
  conversaId,
  dataInicio,
  dataFim,
  usuarioId,
  qtdMensagens,
  observacao,
  status,
  metadata
}) => {
  const auditoriaId = await withTransaction(async (client) => {
    const insertQuery = `
    INSERT INTO auditorias (
      conversa_id,
      data_inicio,
      data_fim,
      usuario_id,
      qtd_mensagens,
      observacao,
      status,
      metadata,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW(), NOW())
    RETURNING id
    `;

    const insertResult = await client.query(insertQuery, [
      conversaId,
      dataInicio,
      dataFim,
      usuarioId,
      qtdMensagens,
      observacao || null,
      status,
      JSON.stringify(metadata || {})
    ]);

    const createdAuditoriaId = insertResult.rows[0]?.id;

    await client.query(
      `
      UPDATE conversas
         SET is_auditada = TRUE,
             auditada_em = $2,
             auditada_por = $3,
             updated_at = NOW()
       WHERE id = $1
      `,
      [conversaId, dataFim, usuarioId]
    );

    logger.info('Auditoria registrada', {
      auditoriaId: createdAuditoriaId,
      conversaId,
      usuarioId,
      dataInicio,
      dataFim,
      qtdMensagens
    });

    return createdAuditoriaId;
  });

  await cacheService.invalidateConversa(conversaId);

  return auditoriaId;
};

const getAuditoriaById = async (auditoriaId) => {
  const query = `
    SELECT
      a.id,
      a.conversa_id,
      a.data_inicio,
      a.data_fim,
      a.usuario_id,
      a.qtd_mensagens,
      a.observacao,
      a.status,
      a.metadata,
      a.created_at,
      a.updated_at,
      c.chat_id AS conversa_chat_id,
      c.tipo AS conversa_tipo,
      c.grupo_id AS conversa_grupo_id,
      c.contato_id AS conversa_contato_id,
      c.ultima_mensagem AS conversa_ultima_mensagem,
      c.ultima_mensagem_timestamp AS conversa_ultima_mensagem_timestamp,
      COALESCE(g.nome, ct.nome, c.chat_id) AS conversa_nome,
      u.nome AS usuario_nome,
      u.email AS usuario_email
    FROM auditorias a
    JOIN conversas c ON c.id = a.conversa_id
    LEFT JOIN grupos g ON g.id = c.grupo_id
    LEFT JOIN contatos ct ON ct.id = c.contato_id
    LEFT JOIN usuarios u ON u.id = a.usuario_id
    WHERE a.id = $1
  `;

  const { rows } = await pool.query(query, [auditoriaId]);
  return mapAuditoriaRow(rows[0]);
};

const listAuditoriaHistory = async (filters, pagination) => {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (filters.status && filters.status !== 'todos') {
    conditions.push(`a.status = $${idx}`);
    values.push(filters.status);
    idx += 1;
  }

  if (filters.usuarioId) {
    conditions.push(`a.usuario_id = $${idx}`);
    values.push(filters.usuarioId);
    idx += 1;
  }

  if (filters.conversaId) {
    conditions.push(`a.conversa_id = $${idx}`);
    values.push(filters.conversaId);
    idx += 1;
  }

  if (filters.tipoConversa) {
    conditions.push(`c.tipo = $${idx}`);
    values.push(filters.tipoConversa);
    idx += 1;
  }

  if (filters.dtStart) {
    conditions.push(`a.data_inicio >= $${idx}`);
    values.push(filters.dtStart);
    idx += 1;
  }

  if (filters.dtEnd) {
    conditions.push(`a.data_fim <= $${idx}`);
    values.push(filters.dtEnd);
    idx += 1;
  }

  if (filters.qtdMin) {
    conditions.push(`a.qtd_mensagens >= $${idx}`);
    values.push(filters.qtdMin);
    idx += 1;
  }

  if (filters.hasObs === true) {
    conditions.push(`a.observacao IS NOT NULL AND LENGTH(TRIM(a.observacao)) > 0`);
  }

  if (filters.hasObs === false) {
    conditions.push(`(a.observacao IS NULL OR LENGTH(TRIM(a.observacao)) = 0)`);
  }

  if (filters.nomeConversa) {
    conditions.push(`COALESCE(g.nome, ct.nome, c.chat_id) ILIKE $${idx}`);
    values.push(`%${filters.nomeConversa}%`);
    idx += 1;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const summaryQuery = `
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE a.status = 'concluida') AS concluidas,
      COUNT(*) FILTER (WHERE a.status = 'reaberta') AS reabertas,
      COUNT(*) FILTER (WHERE a.status = 'cancelada') AS canceladas
    FROM auditorias a
    JOIN conversas c ON c.id = a.conversa_id
    LEFT JOIN grupos g ON g.id = c.grupo_id
    LEFT JOIN contatos ct ON ct.id = c.contato_id
    ${whereClause}
  `;

  const listQuery = `
    SELECT
      a.id,
      a.conversa_id,
      a.data_inicio,
      a.data_fim,
      a.usuario_id,
      a.qtd_mensagens,
      a.observacao,
      a.status,
      a.metadata,
      a.created_at,
      a.updated_at,
      c.chat_id AS conversa_chat_id,
      c.tipo AS conversa_tipo,
      c.grupo_id AS conversa_grupo_id,
      c.contato_id AS conversa_contato_id,
      c.ultima_mensagem AS conversa_ultima_mensagem,
      c.ultima_mensagem_timestamp AS conversa_ultima_mensagem_timestamp,
      COALESCE(g.nome, ct.nome, c.chat_id) AS conversa_nome,
      u.nome AS usuario_nome,
      u.email AS usuario_email,
      COUNT(*) OVER() AS total_count
    FROM auditorias a
    JOIN conversas c ON c.id = a.conversa_id
    LEFT JOIN grupos g ON g.id = c.grupo_id
    LEFT JOIN contatos ct ON ct.id = c.contato_id
    LEFT JOIN usuarios u ON u.id = a.usuario_id
    ${whereClause}
    ORDER BY a.data_fim DESC, a.id DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;

  const [summaryResult, listResult] = await Promise.all([
    pool.query(summaryQuery, values),
    pool.query(listQuery, [...values, pagination.limit, pagination.offset])
  ]);

  const summaryRow = summaryResult.rows[0] || {
    total: 0,
    concluidas: 0,
    reabertas: 0,
    canceladas: 0
  };

  const total = listResult.rows.length ? Number(listResult.rows[0].total_count) : Number(summaryRow.total || 0);

  return {
    total,
    summary: {
      total: Number(summaryRow.total || 0),
      concluidas: Number(summaryRow.concluidas || 0),
      reabertas: Number(summaryRow.reabertas || 0),
      canceladas: Number(summaryRow.canceladas || 0)
    },
    items: listResult.rows.map(mapAuditoriaRow)
  };
};

const getAuditoriaMessages = async (auditoriaId) => {
  const auditoria = await getAuditoriaById(auditoriaId);
  if (!auditoria) {
    throw new NotFoundError('Auditoria não encontrada');
  }

  const query = `
    SELECT
      m.id,
      m.message_id,
      m.conversa_id,
      m.contato_id,
      m.tipo_mensagem,
      m.texto,
      m.media_url,
      m.media_mime_type,
      m.caption,
      m.is_from_me,
      m.timestamp,
      m.status,
      m.metadata,
      ct.nome AS remetente_nome,
      ct.phone AS remetente_phone,
      COALESCE(mc.data, '[]'::jsonb) AS classificacoes
    FROM mensagens m
    LEFT JOIN contatos ct ON m.contato_id = ct.id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', mc.id,
          'macro', mc.macro,
          'item', mc.item,
          'comentario', mc.observacoes,
          'criado_por', mc.criado_por,
          'created_at', mc.created_at
        ) ORDER BY mc.created_at DESC
      ) AS data
      FROM mensagem_classificacao mc
      WHERE mc.mensagem_id = m.id
    ) mc ON TRUE
    WHERE m.conversa_id = $1
      AND m.timestamp > $2::timestamp
      AND m.timestamp <= $3::timestamp
    ORDER BY m.timestamp ASC, m.id ASC
  `;

  const { rows } = await pool.query(query, [
    auditoria.conversaId,
    auditoria.dataInicio,
    auditoria.dataFim
  ]);

  return {
    auditoria,
    mensagens: rows.map(mapMensagemRow)
  };
};

const createReauditoria = async ({ auditoriaId, usuarioId, metadata }) => {
  const { novoId, conversaId } = await withTransaction(async (client) => {
    const selectQuery = `
      SELECT
        a.id,
        a.conversa_id,
        a.data_inicio,
        a.data_fim,
        a.usuario_id,
        a.qtd_mensagens,
        a.observacao,
        a.status,
        a.metadata
      FROM auditorias a
      WHERE a.id = $1
        FOR UPDATE
    `;

    const { rows } = await client.query(selectQuery, [auditoriaId]);
    const original = rows[0];

    if (!original) {
      throw new NotFoundError('Auditoria não encontrada para reabertura');
    }

    const insertQuery = `
      INSERT INTO auditorias (
        conversa_id,
        data_inicio,
        data_fim,
        usuario_id,
        qtd_mensagens,
        observacao,
        status,
        metadata,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'reaberta', $7::jsonb, NOW(), NOW())
      RETURNING id
    `;

    const mergedMetadata = {
      ...(original.metadata || {}),
      ...(metadata || {}),
      reabertura_de: original.id,
      reaberta_por: usuarioId,
      reaberta_em: new Date().toISOString()
    };

    const insertResult = await client.query(insertQuery, [
      original.conversa_id,
      original.data_inicio,
      original.data_fim,
      usuarioId,
      original.qtd_mensagens,
      original.observacao || null,
      JSON.stringify(mergedMetadata)
    ]);

    const novoId = insertResult.rows[0]?.id;

    await client.query(
      `
        UPDATE conversas
           SET is_auditada = FALSE,
               auditada_em = NULL,
               auditada_por = NULL,
               updated_at = NOW()
         WHERE id = $1
      `,
      [original.conversa_id]
    );

    logger.info('Auditoria reaberta', {
      auditoriaOriginal: auditoriaId,
      auditoriaReaberta: novoId,
      conversaId: original.conversa_id,
      usuarioId
    });

    return { novoId, conversaId: original.conversa_id };
  });

  if (conversaId) {
    await cacheService.invalidateConversa(conversaId);
  }

  return novoId;
};

module.exports = {
  listRecentConversations,
  listNonAuditedConversations,
  getConversationPeriod,
  listPeriodMessages,
  insertAuditoria,
  getAuditoriaById,
  listAuditoriaHistory,
  getAuditoriaMessages,
  createReauditoria
};
