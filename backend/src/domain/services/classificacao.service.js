// domain/services/classificacao.service.js
const pool = require('../../infrastructure/database/postgres');
const logger = require('../../shared/config/logger.config');
const { ValidationError, NotFoundError, ConflictError } = require('../../shared/errors/AppError');
const embeddingService = require('./embedding.service');

const DEFAULT_LIMIT = 5;
const KEYWORD_MULTIPLIER = 2;
const CATALOG_ENTITY = 'classificacao_catalogo';
const SLUG_FALLBACK_PREFIX = 'classificacao';
const CATALOG_SELECT_COLUMNS = `
  id,
  macro,
  item,
  slug,
  descricao,
  cor_hex,
  prioridade,
  ativo,
  deleted_at,
  created_at,
  updated_at
`;

const clamp01 = (value) => {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const resolveVectorWeight = (override) => {
  if (typeof override === 'number' && !Number.isNaN(override)) {
    return clamp01(override);
  }

  const envValue = parseFloat(process.env.CLASSIFICACAO_VECTOR_WEIGHT || '0.5');
  if (!Number.isNaN(envValue)) {
    return clamp01(envValue);
  }

  return 0.5;
};

const normalizeString = (value) => {
  if (!value) {
    return '';
  }

  return value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
};

const extractTermList = (raw) => {
  if (!raw) {
    return [];
  }

  if (Array.isArray(raw)) {
    return raw.map((item) => normalizeString(item)).filter((item) => item.length > 0);
  }

  if (typeof raw === 'object') {
    return Object.values(raw)
      .flat()
      .map((item) => normalizeString(item))
      .filter((item) => item.length > 0);
  }

  if (typeof raw === 'string') {
    return normalizeString(raw)
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
};

const trimString = (value) => (typeof value === 'string' ? value.trim() : '');

const toNullableText = (value) => {
  const trimmed = trimString(value);
  return trimmed.length ? trimmed : null;
};

const toSlugFragment = (value) => {
  const trimmed = trimString(value);
  if (!trimmed.length) {
    return '';
  }
  return trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
};

const buildSlugBase = (macro, item) => {
  const macroSlug = toSlugFragment(macro);
  const itemSlug = toSlugFragment(item);
  const combined = [macroSlug, itemSlug].filter(Boolean).join('-');
  if (combined.length) {
    return combined;
  }
  return `${SLUG_FALLBACK_PREFIX}-${Date.now()}`;
};

const normalizeCorHex = (value) => {
  const trimmed = trimString(value);
  if (!trimmed.length) {
    return null;
  }
  return trimmed.toLowerCase();
};

const normalizePrioridade = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = typeof value === 'number' ? value : parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
};

const normalizeAtivo = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = value.toString().trim().toLowerCase();
  if (['true', '1', 'yes', 'sim'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'nao', 'não'].includes(normalized)) {
    return false;
  }
  return fallback;
};

const escapeCsvValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const parseCatalogId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError('ID de classificação inválido');
  }
  return parsed;
};

const mapCatalogRow = (row) => {
  const macro = row.macro;
  const item = row.item;
  const pos = extractTermList(row.pos);
  const neg = extractTermList(row.neg);

  return {
    id: row.id,
    macro,
    item,
    pos,
    neg
  };
};

const mapCatalogRecord = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    macro: row.macro,
    item: row.item,
    slug: row.slug,
    descricao: row.descricao,
    cor_hex: row.cor_hex,
    prioridade: row.prioridade,
    ativo: row.ativo,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
};

const calculateScore = (normalizedText, { pos, neg }) => {
  if (!normalizedText || pos.length === 0) {
    return { matches: 0, excluded: false };
  }

  const negativeMatch = neg.some((term) => normalizedText.includes(term));
  if (negativeMatch) {
    return { matches: 0, excluded: true };
  }

  const matches = pos.reduce((count, term) => {
    if (!term) {
      return count;
    }
    return normalizedText.includes(term) ? count + 1 : count;
  }, 0);

  if (matches === 0) {
    return { matches: 0, excluded: false };
  }

  const score = Math.min(matches * 20, 100);
  return { matches, score, excluded: false };
};

const orderResults = (a, b) => {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  const macroCompare = a.macro.localeCompare(b.macro, 'pt-BR');
  if (macroCompare !== 0) {
    return macroCompare;
  }
  return a.item.localeCompare(b.item, 'pt-BR');
};

const searchByKeywords = (normalizedText, catalogEntries, limit) => {
  const results = catalogEntries
    .map((entry) => {
      const { score, excluded } = calculateScore(normalizedText, entry);
      if (excluded || !score) {
        return null;
      }
      return {
        id: entry.id,
        macro: entry.macro,
        item: entry.item,
        keywordScore: score
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.keywordScore !== a.keywordScore
      ? b.keywordScore - a.keywordScore
      : orderResults(a, b)));

  return results.slice(0, limit);
};

const searchByVector = async ({ texto, limit, db }) => {
  if (!embeddingService.isFeatureEnabled()) {
    return [];
  }

  const start = Date.now();
  try {
    const embedding = await embeddingService.generateTextEmbedding(texto);
    const vectorLiteral = embeddingService.vectorToPg(embedding);

    const { rows } = await db.query(
      `
        SELECT id,
               macro,
               item,
               1 - (embedding <=> $1::vector) AS similarity
        FROM classificacao_catalogo
        WHERE ativo = TRUE
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $2
      `,
      [vectorLiteral, limit]
    );

    const duration = Date.now() - start;
    logger.debug('Busca vetorial concluída', {
      durationMs: duration,
      resultados: rows.length
    });

    return rows.map((row) => {
      const similarity = clamp01(row.similarity || 0);
      return {
        id: row.id,
        macro: row.macro,
        item: row.item,
        vectorScore: similarity
      };
    });
  } catch (error) {
    logger.warn('Busca vetorial falhou, retornando apenas keywords', {
      error: error.message
    });
    return [];
  }
};

const mergeAndRankResults = (keywordResults, vectorResults, vectorWeight) => {
  const weight = resolveVectorWeight(vectorWeight);
  const keywordWeight = 1 - weight;
  const map = new Map();

  const upsert = (entry) => {
    const key = `${entry.macro}::${entry.item}`;
    const current = map.get(key) || {
      macro: entry.macro,
      item: entry.item,
      keywordScore: 0,
      vectorScore: 0
    };
    if (typeof entry.keywordScore === 'number') {
      current.keywordScore = Math.max(current.keywordScore, clamp01(entry.keywordScore / 100));
    }
    if (typeof entry.vectorScore === 'number') {
      current.vectorScore = Math.max(current.vectorScore, clamp01(entry.vectorScore));
    }
    map.set(key, current);
  };

  keywordResults.forEach(upsert);
  vectorResults.forEach(upsert);

  const combined = Array.from(map.values()).map((item) => {
    const finalScoreNormalized = (keywordWeight * item.keywordScore) + (weight * item.vectorScore);
    return {
      macro: item.macro,
      item: item.item,
      score: Math.round(finalScoreNormalized * 100),
      metadata: {
        keywordScore: Math.round(item.keywordScore * 100),
        vectorScore: Math.round(item.vectorScore * 100),
        weightVector: weight
      }
    };
  });

  return combined
    .filter((item) => item.score > 0)
    .sort(orderResults);
};

const suggestFromText = async ({
  texto,
  db = pool,
  limit = DEFAULT_LIMIT,
  useVectorSearch = true,
  vectorWeight = null
}) => {
  const normalizedText = normalizeString(texto);

  if (!normalizedText) {
    return [];
  }

  const client = db;
  const { rows } = await client.query(
    `
      SELECT id, macro, item, pos, neg
      FROM classificacao_catalogo
      WHERE ativo = TRUE
    `
  );

  if (!rows.length) {
    return [];
  }

  const keywordStart = Date.now();
  const catalogEntries = rows.map(mapCatalogRow);
  const keywordResults = searchByKeywords(
    normalizedText,
    catalogEntries,
    limit * KEYWORD_MULTIPLIER
  );
  const keywordDuration = Date.now() - keywordStart;

  logger.debug('Busca por palavras-chave concluída', {
    durationMs: keywordDuration,
    resultados: keywordResults.length
  });

  const shouldUseVector = useVectorSearch && embeddingService.isFeatureEnabled();
  if (!shouldUseVector) {
    return keywordResults.slice(0, limit).map(({ keywordScore, ...rest }) => ({
      ...rest,
      score: keywordScore
    }));
  }

  const vectorResults = await searchByVector({
    texto,
    limit: limit * KEYWORD_MULTIPLIER,
    db: client
  });

  if (!vectorResults.length) {
    return keywordResults.slice(0, limit).map(({ keywordScore, ...rest }) => ({
      ...rest,
      score: keywordScore
    }));
  }

  const merged = mergeAndRankResults(keywordResults, vectorResults, vectorWeight);

  if (!merged.length) {
    return keywordResults.slice(0, limit).map(({ keywordScore, ...rest }) => ({
      ...rest,
      score: keywordScore
    }));
  }

  return merged.slice(0, limit).map(({ metadata, ...rest }) => rest);
};

const resolveDbClient = async (db = pool) => {
  if (db && typeof db.release === 'function' && typeof db.query === 'function' && typeof db.connect !== 'function') {
    return { client: db, shouldRelease: false };
  }

  if (db && typeof db.connect === 'function') {
    const client = await db.connect();
    return { client, shouldRelease: true };
  }

  throw new Error('Database instance inválida para classe de serviço de classificação');
};

const releaseDbClient = (client, shouldRelease) => {
  if (shouldRelease && client && typeof client.release === 'function') {
    client.release();
  }
};

const ensureUniqueSlug = async (client, baseSlug, excludeId = null) => {
  let candidate = baseSlug;
  let suffix = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params = excludeId ? [candidate, excludeId] : [candidate];
    const query = excludeId
      ? 'SELECT 1 FROM classificacao_catalogo WHERE slug = $1 AND id <> $2 LIMIT 1'
      : 'SELECT 1 FROM classificacao_catalogo WHERE slug = $1 LIMIT 1';

    const { rows } = await client.query(query, params);
    if (!rows.length) {
      return candidate;
    }
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
};

const insertAuditLog = async (client, {
  actorId,
  action,
  entityId,
  before,
  after
}) => {
  try {
    await client.query(
      `
        INSERT INTO audit_logs (
          actor_id,
          action,
          entity,
          entity_id,
          before,
          after,
          at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, CURRENT_TIMESTAMP)
      `,
      [
        actorId ?? null,
        action,
        CATALOG_ENTITY,
        entityId,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null
      ]
    );
  } catch (error) {
    logger.warn('Falha ao registrar audit log', {
      action,
      entity: CATALOG_ENTITY,
      entityId,
      error: error.message
    });
  }
};

const findCatalogById = async (client, id, { forUpdate = false } = {}) => {
  const lockClause = forUpdate ? 'FOR UPDATE' : '';
  const { rows } = await client.query(
    `
      SELECT ${CATALOG_SELECT_COLUMNS}
      FROM classificacao_catalogo
      WHERE id = $1
      ${lockClause}
    `,
    [id]
  );

  return mapCatalogRecord(rows[0]);
};

const listCatalog = async (db = pool) => {
  const client = db;
  const { rows } = await client.query(
    `
      SELECT macro, item
      FROM classificacao_catalogo
      WHERE ativo = TRUE
      ORDER BY macro ASC, item ASC
    `
  );

  const macros = [];
  const itens = {};

  for (const row of rows) {
    if (!macros.includes(row.macro)) {
      macros.push(row.macro);
    }
    if (!itens[row.macro]) {
      itens[row.macro] = [];
    }
    itens[row.macro].push(row.item);
  }

  return { macros, itens };
};

const upsertSnapshot = async (db, conversaId, { macro, item, usuario }) => {
  if (!conversaId) {
    throw new Error('conversaId é obrigatório');
  }

  const sanitizedMacro = macro || null;
  const sanitizedItem = item || null;
  const sanitizedUsuario = usuario || null;

  await db.query(
    `
      UPDATE conversas
      SET macro = $1,
          item = $2,
          classificado_por = $3,
          classificado_em = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `,
    [sanitizedMacro, sanitizedItem, sanitizedUsuario, conversaId]
  );
};

const getLatestClassification = async (conversaId, db = pool) => {
  const client = db;
  const { rows } = await client.query(
    `
      SELECT id,
             conversa_id,
             macro,
             item,
             origem,
             confianca,
             criado_por,
             criado_em
      FROM conversa_classificacao
      WHERE conversa_id = $1
      ORDER BY criado_em DESC
      LIMIT 1
    `,
    [conversaId]
  );

  return rows[0] || null;
};

const mapMessageClassificationRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    messageId: row.message_id,
    conversaId: row.conversa_id,
    userId: row.user_id,
    macro: row.macro,
    item: row.item,
    comentario: row.comentario,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const getMessageClassification = async (messageId, db = pool) => {
  if (!messageId) {
    throw new ValidationError('messageId é obrigatório');
  }

  const client = db;
  const { rows } = await client.query(
    `
      SELECT id,
             message_id,
             conversa_id,
             user_id,
             macro,
             item,
             comentario,
             created_at,
             updated_at
        FROM mensagem_classificacao
       WHERE message_id = $1
    `,
    [messageId]
  );

  return mapMessageClassificationRow(rows[0] || null);
};

const upsertMessageClassification = async (
  {
    messageId,
    conversaId,
    userId,
    macro,
    item,
    comentario
  },
  db = pool
) => {
  if (!messageId) {
    throw new ValidationError('messageId é obrigatório');
  }
  if (!userId) {
    throw new ValidationError('userId é obrigatório');
  }

  const client = db;

  const { rows: messageRows } = await client.query(
    `
      SELECT id, conversa_id
        FROM mensagens
       WHERE id = $1
    `,
    [messageId]
  );

  if (messageRows.length === 0) {
    throw new NotFoundError('Mensagem não encontrada');
  }

  const message = messageRows[0];
  const resolvedConversaId = message.conversa_id;

  if (conversaId && conversaId !== resolvedConversaId) {
    throw new ValidationError('Mensagem não pertence à conversa informada');
  }

  const { rows: catalogRows } = await client.query(
    `
      SELECT 1
        FROM classificacao_catalogo
       WHERE macro = $1
         AND item = $2
         AND ativo = TRUE
    `,
    [macro, item]
  );

  if (catalogRows.length === 0) {
    throw new ValidationError('Macro/Item não encontrados no catálogo ativo');
  }

  const comentarioValue =
    typeof comentario === 'string' && comentario.trim().length > 0
      ? comentario.trim()
      : null;

  const { rows } = await client.query(
    `
      INSERT INTO mensagem_classificacao (
        message_id,
        conversa_id,
        user_id,
        macro,
        item,
        comentario
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (message_id)
      DO UPDATE SET
        macro = EXCLUDED.macro,
        item = EXCLUDED.item,
        user_id = EXCLUDED.user_id,
        comentario = EXCLUDED.comentario,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id,
                message_id,
                conversa_id,
                user_id,
                macro,
                item,
                comentario,
                created_at,
                updated_at
    `,
    [messageId, resolvedConversaId, userId, macro, item, comentarioValue]
  );

  return mapMessageClassificationRow(rows[0]);
};

const resolveOrderByClause = (sort) => {
  if (!sort || typeof sort !== 'string') {
    return 'prioridade ASC, macro ASC, item ASC, id ASC';
  }

  const allowed = {
    prioridade: 'prioridade',
    macro: 'macro',
    item: 'item',
    slug: 'slug',
    created_at: 'created_at',
    updated_at: 'updated_at',
    ativo: 'ativo'
  };

  const clauses = sort
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const [fieldRaw, dirRaw] = segment.split(':');
      const field = fieldRaw ? fieldRaw.trim().toLowerCase() : '';
      const direction = dirRaw ? dirRaw.trim().toLowerCase() : 'asc';
      const column = allowed[field];
      if (!column) {
        return null;
      }
      const normalizedDirection = direction === 'desc' ? 'DESC' : 'ASC';
      return `${column} ${normalizedDirection}`;
    })
    .filter(Boolean);

  if (!clauses.length) {
    return 'prioridade ASC, macro ASC, item ASC, id ASC';
  }

  clauses.push('id ASC');
  return clauses.join(', ');
};

const list = async (
  {
    q,
    ativo = 'true',
    page = 1,
    pageSize = 20,
    sort
  } = {},
  options = {}
) => {
  const db = options?.db || pool;
  const safePage = Math.max(Number(page) || 1, 1);
  const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 200);
  const offset = (safePage - 1) * safePageSize;

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  const ativoFilter = String(ativo || 'true').toLowerCase();

  if (ativoFilter === 'false') {
    conditions.push('ativo = FALSE');
    conditions.push('deleted_at IS NULL');
  } else if (ativoFilter === 'all') {
    conditions.push('deleted_at IS NULL');
  } else if (ativoFilter === 'deleted') {
    conditions.push('deleted_at IS NOT NULL');
  } else {
    conditions.push('ativo = TRUE');
    conditions.push('deleted_at IS NULL');
  }

  if (q && q.trim().length) {
    params.push(`%${q.trim()}%`);
    conditions.push(
      `(
        macro ILIKE $${paramIndex}
        OR item ILIKE $${paramIndex}
        OR descricao ILIKE $${paramIndex}
        OR slug ILIKE $${paramIndex}
      )`
    );
    paramIndex += 1;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderByClause = resolveOrderByClause(sort);

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM classificacao_catalogo
    ${whereClause}
  `;

  const dataQuery = `
    SELECT ${CATALOG_SELECT_COLUMNS}
    FROM classificacao_catalogo
    ${whereClause}
    ORDER BY ${orderByClause}
    LIMIT $${paramIndex}
    OFFSET $${paramIndex + 1}
  `;

  const countParams = [...params];
  const dataParams = [...params, safePageSize, offset];

  const [countResult, dataResult] = await Promise.all([
    db.query(countQuery, countParams),
    db.query(dataQuery, dataParams)
  ]);

  const total = parseInt(countResult.rows[0]?.total, 10) || 0;
  const data = dataResult.rows.map(mapCatalogRecord);

  return {
    data,
    total,
    page: safePage,
    pageSize: safePageSize
  };
};

const create = async (payload, actor, options = {}) => {
  if (!payload) {
    throw new ValidationError('Dados obrigatórios não informados');
  }

  const macro = trimString(payload.macro);
  const item = trimString(payload.item);

  if (!macro) {
    throw new ValidationError('macro é obrigatório');
  }

  if (!item) {
    throw new ValidationError('item é obrigatório');
  }

  const descricao = payload.descricao !== undefined ? toNullableText(payload.descricao) : null;
  const corHex = payload.cor_hex !== undefined ? normalizeCorHex(payload.cor_hex) : null;
  const prioridade = normalizePrioridade(payload.prioridade, 0);
  const ativo = normalizeAtivo(payload.ativo, true);

  const db = options?.db || pool;
  const { client, shouldRelease } = await resolveDbClient(db);

  try {
    await client.query('BEGIN');

    const baseSlug = buildSlugBase(macro, item);
    const slug = await ensureUniqueSlug(client, baseSlug);

    const insertResult = await client.query(
      `
        INSERT INTO classificacao_catalogo (
          macro,
          item,
          slug,
          descricao,
          cor_hex,
          prioridade,
          ativo,
          deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
        RETURNING ${CATALOG_SELECT_COLUMNS}
      `,
      [macro, item, slug, descricao, corHex, prioridade, ativo]
    );

    const record = mapCatalogRecord(insertResult.rows[0]);

    await insertAuditLog(client, {
      actorId: actor?.id ?? null,
      action: 'create',
      entityId: record.id,
      before: null,
      after: record
    });

    await client.query('COMMIT');

    return record;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    if (error.code === '23505') {
      throw new ConflictError('Classificação já existe');
    }

    throw error;
  } finally {
    releaseDbClient(client, shouldRelease);
  }
};

const update = async (id, payload, actor, options = {}) => {
  const catalogId = parseCatalogId(id);
  if (!payload || Object.keys(payload).length === 0) {
    throw new ValidationError('Nenhum campo informado para atualização');
  }

  const db = options?.db || pool;
  const { client, shouldRelease } = await resolveDbClient(db);

  try {
    await client.query('BEGIN');

    const current = await findCatalogById(client, catalogId, { forUpdate: true });
    if (!current || current.deleted_at) {
      throw new NotFoundError('Classificação não encontrada');
    }

    const nextValues = {
      macro: payload.macro !== undefined ? trimString(payload.macro) : current.macro,
      item: payload.item !== undefined ? trimString(payload.item) : current.item,
      descricao: payload.descricao !== undefined ? toNullableText(payload.descricao) : current.descricao,
      cor_hex: payload.cor_hex !== undefined ? normalizeCorHex(payload.cor_hex) : current.cor_hex,
      prioridade: payload.prioridade !== undefined
        ? normalizePrioridade(payload.prioridade, current.prioridade ?? 0)
        : current.prioridade,
      ativo: payload.ativo !== undefined ? normalizeAtivo(payload.ativo, current.ativo) : current.ativo
    };

    if (!nextValues.macro) {
      throw new ValidationError('macro é obrigatório');
    }
    if (!nextValues.item) {
      throw new ValidationError('item é obrigatório');
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    const macroChanged = nextValues.macro !== current.macro;
    const itemChanged = nextValues.item !== current.item;

    if (macroChanged) {
      updates.push(`macro = $${paramIndex}`);
      values.push(nextValues.macro);
      paramIndex += 1;
    }

    if (itemChanged) {
      updates.push(`item = $${paramIndex}`);
      values.push(nextValues.item);
      paramIndex += 1;
    }

    if (payload.descricao !== undefined && nextValues.descricao !== current.descricao) {
      updates.push(`descricao = $${paramIndex}`);
      values.push(nextValues.descricao);
      paramIndex += 1;
    }

    if (payload.cor_hex !== undefined && nextValues.cor_hex !== current.cor_hex) {
      updates.push(`cor_hex = $${paramIndex}`);
      values.push(nextValues.cor_hex);
      paramIndex += 1;
    }

    if (payload.prioridade !== undefined && nextValues.prioridade !== current.prioridade) {
      updates.push(`prioridade = $${paramIndex}`);
      values.push(nextValues.prioridade);
      paramIndex += 1;
    }

    if (payload.ativo !== undefined && nextValues.ativo !== current.ativo) {
      updates.push(`ativo = $${paramIndex}`);
      values.push(nextValues.ativo);
      paramIndex += 1;
    }

    let slugToUse = current.slug;

    if (macroChanged || itemChanged) {
      const baseSlug = buildSlugBase(nextValues.macro, nextValues.item);
      slugToUse = await ensureUniqueSlug(client, baseSlug, catalogId);
      if (slugToUse !== current.slug) {
        updates.push(`slug = $${paramIndex}`);
        values.push(slugToUse);
        paramIndex += 1;
      }
    }

    if (!updates.length) {
      await client.query('ROLLBACK').catch(() => {});
      return current;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const updateResult = await client.query(
      `
        UPDATE classificacao_catalogo
           SET ${updates.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING ${CATALOG_SELECT_COLUMNS}
      `,
      [...values, catalogId]
    );

    if (!updateResult.rows.length) {
      throw new NotFoundError('Classificação não encontrada');
    }

    const record = mapCatalogRecord(updateResult.rows[0]);

    await insertAuditLog(client, {
      actorId: actor?.id ?? null,
      action: 'update',
      entityId: catalogId,
      before: current,
      after: record
    });

    await client.query('COMMIT');

    return record;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});

    if (error.code === '23505') {
      throw new ConflictError('Já existe uma classificação com estes dados');
    }

    throw error;
  } finally {
    releaseDbClient(client, shouldRelease);
  }
};

const toggle = async (id, actor, options = {}) => {
  const catalogId = parseCatalogId(id);
  const db = options?.db || pool;
  const { client, shouldRelease } = await resolveDbClient(db);

  try {
    await client.query('BEGIN');

    const current = await findCatalogById(client, catalogId, { forUpdate: true });
    if (!current || current.deleted_at) {
      throw new NotFoundError('Classificação não encontrada');
    }

    const toggleResult = await client.query(
      `
        UPDATE classificacao_catalogo
           SET ativo = NOT ativo,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING ${CATALOG_SELECT_COLUMNS}
      `,
      [catalogId]
    );

    const record = mapCatalogRecord(toggleResult.rows[0]);

    await insertAuditLog(client, {
      actorId: actor?.id ?? null,
      action: 'toggle_active',
      entityId: catalogId,
      before: current,
      after: record
    });

    await client.query('COMMIT');
    return record;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    releaseDbClient(client, shouldRelease);
  }
};

const softDelete = async (id, actor, options = {}) => {
  const catalogId = parseCatalogId(id);
  const db = options?.db || pool;
  const { client, shouldRelease } = await resolveDbClient(db);

  try {
    await client.query('BEGIN');

    const current = await findCatalogById(client, catalogId, { forUpdate: true });
    if (!current || current.deleted_at) {
      throw new NotFoundError('Classificação não encontrada');
    }

    const deleteResult = await client.query(
      `
        UPDATE classificacao_catalogo
           SET ativo = FALSE,
               deleted_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING ${CATALOG_SELECT_COLUMNS}
      `,
      [catalogId]
    );

    const record = mapCatalogRecord(deleteResult.rows[0]);

    await insertAuditLog(client, {
      actorId: actor?.id ?? null,
      action: 'soft_delete',
      entityId: catalogId,
      before: current,
      after: record
    });

    await client.query('COMMIT');
    return record;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    releaseDbClient(client, shouldRelease);
  }
};

const importCsv = async (rows, actor, options = {}) => {
  if (!Array.isArray(rows)) {
    throw new ValidationError('Importação inválida: dados ausentes');
  }

  const db = options?.db || pool;
  const { client, shouldRelease } = await resolveDbClient(db);

  const results = [];

  for (const row of rows) {
    const line = row?.line ?? null;
    const macro = trimString(row?.macro);
    const item = trimString(row?.item);
    if (!macro || !item) {
      results.push({
        line,
        status: 'error',
        error: 'macro e item são obrigatórios'
      });
      continue;
    }

    const descricao = row?.descricao !== undefined ? toNullableText(row.descricao) : null;
    const corHex = row?.cor_hex !== undefined ? normalizeCorHex(row.cor_hex) : null;
    const prioridade = normalizePrioridade(row?.prioridade, 0);
    const ativo = normalizeAtivo(row?.ativo, true);
    const baseSlug = buildSlugBase(macro, item);

    let action = 'created';
    let record = null;
    let before = null;

    try {
      await client.query('BEGIN');

      let existingResult = await client.query(
        `
          SELECT ${CATALOG_SELECT_COLUMNS}
            FROM classificacao_catalogo
           WHERE slug = $1
           FOR UPDATE
        `,
        [baseSlug]
      );

      if (!existingResult.rows.length) {
        existingResult = await client.query(
          `
            SELECT ${CATALOG_SELECT_COLUMNS}
              FROM classificacao_catalogo
             WHERE macro = $1
               AND item = $2
             FOR UPDATE
          `,
          [macro, item]
        );
      }

      if (existingResult.rows.length) {
        before = mapCatalogRecord(existingResult.rows[0]);
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (before.macro !== macro) {
          updates.push(`macro = $${paramIndex}`);
          values.push(macro);
          paramIndex += 1;
        }

        if (before.item !== item) {
          updates.push(`item = $${paramIndex}`);
          values.push(item);
          paramIndex += 1;
        }

        if (before.descricao !== descricao) {
          updates.push(`descricao = $${paramIndex}`);
          values.push(descricao);
          paramIndex += 1;
        }

        if (before.cor_hex !== corHex) {
          updates.push(`cor_hex = $${paramIndex}`);
          values.push(corHex);
          paramIndex += 1;
        }

        if (before.prioridade !== prioridade) {
          updates.push(`prioridade = $${paramIndex}`);
          values.push(prioridade);
          paramIndex += 1;
        }

        if (before.ativo !== ativo) {
          updates.push(`ativo = $${paramIndex}`);
          values.push(ativo);
          paramIndex += 1;
        }

        let slugToUse = before.slug;
        if (before.macro !== macro || before.item !== item) {
          slugToUse = await ensureUniqueSlug(client, baseSlug, before.id);
          if (slugToUse !== before.slug) {
            updates.push(`slug = $${paramIndex}`);
            values.push(slugToUse);
            paramIndex += 1;
          }
        }

        if (!updates.length) {
          record = before;
          action = 'updated';
        } else {
          updates.push('updated_at = CURRENT_TIMESTAMP');

          const updateResult = await client.query(
            `
              UPDATE classificacao_catalogo
                 SET ${updates.join(', ')}
               WHERE id = $${paramIndex}
               RETURNING ${CATALOG_SELECT_COLUMNS}
            `,
            [...values, before.id]
          );

          record = mapCatalogRecord(updateResult.rows[0]);
          action = 'updated';
        }
      } else {
        const slug = await ensureUniqueSlug(client, baseSlug);
        const insertResult = await client.query(
          `
            INSERT INTO classificacao_catalogo (
              macro,
              item,
              slug,
              descricao,
              cor_hex,
              prioridade,
              ativo,
              deleted_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
            RETURNING ${CATALOG_SELECT_COLUMNS}
          `,
          [macro, item, slug, descricao, corHex, prioridade, ativo]
        );
        record = mapCatalogRecord(insertResult.rows[0]);
        action = 'created';
      }

      await insertAuditLog(client, {
        actorId: actor?.id ?? null,
        action: 'import_csv',
        entityId: record.id,
        before,
        after: record
      });

      await client.query('COMMIT');
      results.push({
        line,
        status: action,
        slug: record.slug
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      results.push({
        line,
        status: 'error',
        slug: baseSlug,
        error: error instanceof ValidationError ? error.message : error.message || 'Erro inesperado'
      });
    }
  }

  releaseDbClient(client, shouldRelease);

  return results;
};

const exportCsv = async (options = {}) => {
  const db = options?.db || pool;
  const { rows } = await db.query(
    `
      SELECT macro,
             item,
             COALESCE(descricao, '') AS descricao,
             COALESCE(cor_hex, '') AS cor_hex,
             prioridade,
             ativo
        FROM classificacao_catalogo
       WHERE deleted_at IS NULL
       ORDER BY macro ASC, item ASC
    `
  );

  const header = 'macro,item,descricao,cor_hex,prioridade,ativo';
  const lines = rows.map((row) => {
    return [
      escapeCsvValue(row.macro),
      escapeCsvValue(row.item),
      escapeCsvValue(row.descricao),
      escapeCsvValue(row.cor_hex),
      escapeCsvValue(row.prioridade ?? 0),
      row.ativo ? 'true' : 'false'
    ].join(',');
  });

  return [header, ...lines].join('\n');
};

module.exports = {
  listCatalog,
  suggestFromText,
  upsertSnapshot,
  getLatestClassification,
  getMessageClassification,
  upsertMessageClassification,
  list,
  create,
  update,
  toggle,
  softDelete,
  importCsv,
  exportCsv
};
