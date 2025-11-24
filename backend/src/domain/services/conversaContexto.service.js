// domain/services/conversaContexto.service.js
const pool = require('../../infrastructure/database/postgres');
const logger = require('../../shared/config/logger.config');
const { AIProvider } = require('../../../ai-provider');
const embeddingService = require('./embedding.service');

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

const createServiceError = (code, message, statusCode = 400) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

const parseThemes = (value) => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : null))
      .filter((item) => item && item.length > 0);
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parseThemes(parsed);
      }
    } catch {
      return value
        .split(/[;,]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
  }
  if (typeof value === 'object') {
    try {
      return parseThemes(Object.values(value).flat());
    } catch {
      return [];
    }
  }
  return [];
};

const normalizeDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
};

const toTimestampParam = (value, fieldName = 'timestamp') => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw createServiceError('invalid_date', `Parâmetro ${fieldName} inválido`);
  }
  return date;
};

const mapContextRow = (row) => {
  const base = {
    id: row.id,
    conversa_id: row.conversa_id,
    periodo_inicio: normalizeDate(row.periodo_inicio),
    periodo_fim: normalizeDate(row.periodo_fim),
    total_mensagens: row.total_mensagens,
    resumo: row.resumo,
    temas_principais: parseThemes(row.temas_principais),
    created_at: normalizeDate(row.created_at)
  };

  if (row.score_sim !== undefined && row.score_sim !== null) {
    base.score_sim = Number(row.score_sim);
  }
  return base;
};

let cachedEmbeddingDimension = null;

const detectEmbeddingDimension = async () => {
  if (cachedEmbeddingDimension) {
    return cachedEmbeddingDimension;
  }

  try {
    const { rows } = await pool.query(
      `
        SELECT vector_dims(embedding) AS dimension
        FROM conversa_contexto
        WHERE embedding IS NOT NULL
        LIMIT 1
      `
    );

    const dimension = rows[0]?.dimension ? Number(rows[0].dimension) : null;
    if (dimension) {
      cachedEmbeddingDimension = dimension;
    }
  } catch (error) {
    logger.warn('Falha ao detectar dimensão de embedding', {
      error: error.message
    });
  }

  return cachedEmbeddingDimension;
};

const aiProvider = new AIProvider();

const DEFAULT_WINDOW_SIZE = parseInt(process.env.CONTEXT_SUMMARY_WINDOW_SIZE || '40', 10);
const DEFAULT_MIN_MESSAGES = parseInt(process.env.CONTEXT_SUMMARY_MIN_MESSAGES || '5', 10);
const DEFAULT_CONVERSATION_LIMIT = parseInt(process.env.CONTEXT_SUMMARY_CONVERSATION_LIMIT || '5', 10);
const SUMMARY_MAX_TOKENS = parseInt(process.env.CONTEXT_SUMMARY_MAX_TOKENS || '450', 10);

const extractJson = (text) => {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch {
      return null;
    }
  }

  return null;
};

const formatMessageForPrompt = (row) => {
  const timestamp = row.timestamp instanceof Date
    ? row.timestamp.toISOString()
    : new Date(row.timestamp).toISOString();
  const author = row.is_from_me ? 'Atendente' : 'Cliente';

  const content =
    (typeof row.texto === 'string' && row.texto.trim().length > 0 && row.texto.trim())
    || (typeof row.caption === 'string' && row.caption.trim().length > 0 && row.caption.trim())
    || `[${row.tipo_mensagem || 'mensagem'} sem texto]`;

  return `[${timestamp}] ${author}: ${content}`;
};

const summarizeWindow = async ({ conversationId, formattedTranscript }) => {
  const provider = process.env.CONTEXT_SUMMARY_PROVIDER || null;

  const messages = [
    {
      role: 'system',
      content: 'Você é um assistente que resume conversas WhatsApp entre atendentes e clientes. Responda em JSON no formato {"resumo": "...", "topicos": ["..."]}. Seja objetivo, inclua até 5 tópicos curtos.'
    },
    {
      role: 'user',
      content: formattedTranscript
    }
  ];

  const response = await aiProvider.gerarResposta(messages, provider, {
    temperature: 0.2,
    maxTokens: SUMMARY_MAX_TOKENS
  });

  const parsed = extractJson(response?.texto || '');

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('summary-json-invalid');
  }

  const resumo = typeof parsed.resumo === 'string' ? parsed.resumo.trim() : '';
  const topicos = Array.isArray(parsed.topicos)
    ? parsed.topicos
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    : [];

  if (!resumo) {
    throw new Error('summary-empty');
  }

  return {
    resumo,
    topicos,
    raw: response?.texto || null
  };
};

const buildMetadata = ({ rows, summary, durationMs }) => {
  const lastMessageId = rows[rows.length - 1].id;
  const firstMessageId = rows[0].id;

  return {
    first_message_id: firstMessageId,
    last_message_id: lastMessageId,
    message_ids: rows.map((row) => row.id),
    generated_at: new Date().toISOString(),
    duration_ms: durationMs,
    summary_raw: summary.raw || null,
    window_size: rows.length
  };
};

const clampLimit = (limit) => {
  const numeric = Number(limit);
  if (Number.isNaN(numeric) || numeric <= 0) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.floor(numeric), MAX_PAGE_SIZE);
};

const clampOffset = (offset) => {
  const numeric = Number(offset);
  if (Number.isNaN(numeric) || numeric < 0) {
    return 0;
  }
  return Math.floor(numeric);
};

const countContextos = async ({ conversaId, from, to }) => {
  const { rows } = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM conversa_contexto
      WHERE conversa_id = $1
        AND ($2::timestamptz IS NULL OR periodo_inicio >= $2)
        AND ($3::timestamptz IS NULL OR periodo_fim <= $3)
    `,
    [conversaId, from, to]
  );

  return rows[0]?.total || 0;
};

const listByConversa = async ({
  conversaId,
  limit = DEFAULT_PAGE_SIZE,
  offset = 0,
  from = null,
  to = null,
  sort = 'recent'
}) => {
  if (!conversaId) {
    throw createServiceError('invalid_conversation_id', 'conversaId é obrigatório');
  }

  if (sort === 'sim') {
    throw createServiceError('invalid_sort', 'Use searchSimilarByConversa para ordenação por similaridade');
  }

  const normalizedLimit = clampLimit(limit);
  const normalizedOffset = clampOffset(offset);
  const fromParam = toTimestampParam(from, 'from');
  const toParam = toTimestampParam(to, 'to');

  const orderClause = sort === 'oldest' ? 'periodo_inicio ASC' : 'periodo_fim DESC';

  const queryStart = Date.now();

  const { rows } = await pool.query(
    `
      SELECT
        id,
        conversa_id,
        periodo_inicio,
        periodo_fim,
        total_mensagens,
        resumo,
        temas_principais,
        created_at
      FROM conversa_contexto
      WHERE conversa_id = $1
        AND ($2::timestamptz IS NULL OR periodo_inicio >= $2)
        AND ($3::timestamptz IS NULL OR periodo_fim <= $3)
      ORDER BY ${orderClause}
      LIMIT $4
      OFFSET $5
    `,
    [conversaId, fromParam, toParam, normalizedLimit, normalizedOffset]
  );

  const count = await countContextos({ conversaId, from: fromParam, to: toParam });
  const durationMs = Date.now() - queryStart;

  logger.info('conversa_contexto.list', {
    conversaId,
    sort,
    limit: normalizedLimit,
    offset: normalizedOffset,
    returned: rows.length,
    total: count,
    durationMs
  });

  const items = rows.map(mapContextRow);
  const hasMore = normalizedOffset + items.length < count;

  return {
    items,
    count,
    limit: normalizedLimit,
    offset: normalizedOffset,
    hasMore,
    durationMs,
    sort
  };
};

const searchSimilarByConversa = async ({
  conversaId,
  queryText,
  limit = DEFAULT_PAGE_SIZE,
  offset = 0,
  from = null,
  to = null
}) => {
  if (!conversaId) {
    throw createServiceError('invalid_conversation_id', 'conversaId é obrigatório');
  }

  const sanitizedQuery = typeof queryText === 'string' ? queryText.trim() : '';
  if (!sanitizedQuery) {
    throw createServiceError('missing_query', 'queryText é obrigatório para busca por similaridade');
  }

  const normalizedLimit = clampLimit(limit);
  const normalizedOffset = clampOffset(offset);
  const fromParam = toTimestampParam(from, 'from');
  const toParam = toTimestampParam(to, 'to');

  const embeddingStart = Date.now();
  let embeddingVector;
  try {
    embeddingVector = await embeddingService.generateTextEmbedding(sanitizedQuery);
  } catch (error) {
    if (error?.message === 'feature-disabled') {
      throw createServiceError('embeddings_disabled', 'Geração de embeddings está desativada', 503);
    }
    if (error?.message === 'empty-text') {
      throw createServiceError('invalid_query', 'O texto da consulta não pode ser vazio', 400);
    }
    throw createServiceError('embedding_failed', `Falha ao gerar embedding: ${error.message}`, 500);
  }
  const dimension = await detectEmbeddingDimension();
  if (dimension && embeddingVector.length !== dimension) {
    throw createServiceError(
      'embedding_dimension_mismatch',
      `Dimensão do embedding (${embeddingVector.length}) diferente da armazenada (${dimension})`,
      500
    );
  }
  const embeddingLiteral = embeddingService.vectorToPg(embeddingVector);
  const embeddingMs = Date.now() - embeddingStart;

  const queryStart = Date.now();

  const { rows } = await pool.query(
    `
      WITH q AS (SELECT $2::vector AS v)
      SELECT
        c.id,
        c.conversa_id,
        c.periodo_inicio,
        c.periodo_fim,
        c.total_mensagens,
        c.resumo,
        c.temas_principais,
        c.created_at,
        (c.embedding <=> q.v) AS score_sim
      FROM conversa_contexto c, q
      WHERE c.conversa_id = $1
        AND ($3::timestamptz IS NULL OR c.periodo_inicio >= $3)
        AND ($4::timestamptz IS NULL OR c.periodo_fim <= $4)
      ORDER BY score_sim ASC
      LIMIT $5
      OFFSET $6
    `,
    [conversaId, embeddingLiteral, fromParam, toParam, normalizedLimit, normalizedOffset]
  );

  const count = await countContextos({ conversaId, from: fromParam, to: toParam });
  const durationMs = Date.now() - queryStart;

  logger.info('conversa_contexto.search', {
    conversaId,
    sort: 'sim',
    limit: normalizedLimit,
    offset: normalizedOffset,
    returned: rows.length,
    total: count,
    durationMs,
    embeddingMs
  });

  const items = rows.map(mapContextRow);
  const hasMore = normalizedOffset + items.length < count;

  return {
    items,
    count,
    limit: normalizedLimit,
    offset: normalizedOffset,
    hasMore,
    durationMs,
    embeddingMs,
    sort: 'sim'
  };
};

const listConversationsWithContext = async () => {
  const { rows } = await pool.query(
    `
      SELECT
        c.id AS conversa_id,
        c.chat_id,
        c.tipo,
        c.grupo_id,
        g.nome AS nome_grupo,
        c.metadata,
        COUNT(ctx.id)::int AS total_contextos,
        MAX(ctx.periodo_fim) AS ultimo_periodo
      FROM conversa_contexto ctx
      JOIN conversas c ON c.id = ctx.conversa_id
      LEFT JOIN grupos g ON g.id = c.grupo_id
      WHERE c.tipo = 'grupo'
      GROUP BY c.id, c.chat_id, c.tipo, c.grupo_id, g.nome, c.metadata
      ORDER BY g.nome NULLS LAST, c.chat_id
    `
  );

  return rows.map((row) => ({
    conversa_id: row.conversa_id,
    chat_id: row.chat_id,
    tipo: row.tipo,
    grupo_id: row.grupo_id,
    nome: row.nome_grupo || row.chat_id,
    total_contextos: row.total_contextos,
    ultimo_periodo: normalizeDate(row.ultimo_periodo)
  }));
};

const fetchPendingConversations = async (client, limit) => {
  const { rows } = await client.query(
    `
      WITH last_context AS (
        SELECT DISTINCT ON (conversa_id)
               conversa_id,
               periodo_fim,
               (metadata->>'last_message_id')::bigint AS last_message_id
        FROM conversa_contexto
        ORDER BY conversa_id, periodo_fim DESC
      )
      SELECT c.id AS conversa_id,
             COALESCE(lc.periodo_fim, '1970-01-01'::timestamp) AS last_period_end,
             COALESCE(lc.last_message_id, 0) AS last_message_id
      FROM conversas c
      JOIN mensagens m ON m.conversa_id = c.id
      LEFT JOIN last_context lc ON lc.conversa_id = c.id
      WHERE m.id > COALESCE(lc.last_message_id, 0)
      GROUP BY c.id, lc.periodo_fim, lc.last_message_id
      ORDER BY COALESCE(lc.periodo_fim, '1970-01-01'::timestamp), c.id
      LIMIT $1
    `,
    [limit]
  );

  return rows;
};

const fetchMessageWindow = async (client, conversaId, lastMessageId, windowSize) => {
  const { rows } = await client.query(
    `
      SELECT id,
             texto,
             caption,
             tipo_mensagem,
             timestamp,
             is_from_me
      FROM mensagens
      WHERE conversa_id = $1
        AND id > $2
      ORDER BY id ASC
      LIMIT $3
    `,
    [conversaId, lastMessageId, windowSize]
  );

  return rows;
};

async function processPendingContexts({
  windowSize = DEFAULT_WINDOW_SIZE,
  minMessages = DEFAULT_MIN_MESSAGES,
  conversationLimit = DEFAULT_CONVERSATION_LIMIT
} = {}) {
  const client = await pool.connect();
  const stats = {
    processed: 0,
    totalMessages: 0,
    conversationsChecked: 0
  };

  try {
    const pending = await fetchPendingConversations(client, conversationLimit);

    if (!pending.length) {
      logger.debug('Contexto: nenhuma conversa pendente para resumo');
      return stats;
    }

    for (const conversation of pending) {
      stats.conversationsChecked += 1;

      const rows = await fetchMessageWindow(
        client,
        conversation.conversa_id,
        conversation.last_message_id,
        windowSize
      );

      if (!rows.length) {
        continue;
      }

      if (rows.length < minMessages) {
        const { rows: pendingRows } = await client.query(
          `
            SELECT COUNT(*)::int AS pending
            FROM mensagens
            WHERE conversa_id = $1
              AND id > $2
          `,
          [conversation.conversa_id, rows[rows.length - 1].id]
        );

        if (pendingRows[0]?.pending > 0) {
          // Ainda há mensagens futuras suficientes para formar uma janela maior.
          continue;
        }
      }

      const formattedTranscript = rows.map(formatMessageForPrompt).join('\n');
      const summaryStart = Date.now();

      let resumoResult;
      try {
        resumoResult = await summarizeWindow({
          conversationId: conversation.conversa_id,
          formattedTranscript
        });
      } catch (error) {
        logger.warn('Contexto: falha ao gerar resumo', {
          conversaId: conversation.conversa_id,
          error: error.message
        });
        continue;
      }

      let embeddingLiteral = null;

      if (embeddingService.isFeatureEnabled()) {
        try {
          const embedding = await embeddingService.generateEmbedding(resumoResult.resumo);
          embeddingLiteral = embeddingService.vectorToPg(embedding);
        } catch (error) {
          logger.warn('Contexto: falha ao gerar embedding do resumo', {
            conversaId: conversation.conversa_id,
            error: error.message
          });
        }
      }

      const durationMs = Date.now() - summaryStart;
      const metadata = buildMetadata({ rows, summary: resumoResult, durationMs });

      const periodoInicio = rows[0].timestamp;
      const periodoFim = rows[rows.length - 1].timestamp;

      await client.query(
        `
          INSERT INTO conversa_contexto (
            conversa_id,
            periodo_inicio,
            periodo_fim,
            total_mensagens,
            resumo,
            temas_principais,
            embedding,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          conversation.conversa_id,
          periodoInicio,
          periodoFim,
          rows.length,
          resumoResult.resumo,
          resumoResult.topicos,
          embeddingLiteral,
          metadata
        ]
      );

      stats.processed += 1;
      stats.totalMessages += rows.length;

      logger.info('Contexto: janela consolidada', {
        conversaId: conversation.conversa_id,
        mensagens: rows.length,
        durationMs,
        embedding: Boolean(embeddingLiteral)
      });
    }

    return stats;
  } finally {
    client.release();
  }
}

module.exports = {
  processPendingContexts,
  listByConversa,
  searchSimilarByConversa,
  listConversationsWithContext
};
