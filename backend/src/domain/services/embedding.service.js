// domain/services/embedding.service.js
const pool = require('../../infrastructure/database/postgres');
const logger = require('../../shared/config/logger.config');
const { AIProvider } = require('../../../ai-provider');

const aiProvider = new AIProvider();

const isFeatureEnabled = () => String(process.env.FEATURE_EMBEDDING || '').toLowerCase() === 'true';

const vectorToPg = (vector) => `[${vector.join(',')}]`;

const shouldSkip = (texto) => {
  if (!texto) return true;
  const trimmed = texto.trim();
  if (!trimmed) return true;
  return trimmed.length < 2;
};

const fetchMessageContent = async (db, messageId) => {
  const { rows } = await db.query(
    'SELECT texto, caption FROM mensagens WHERE id = $1',
    [messageId]
  );

  if (!rows.length) {
    return null;
  }

  return rows[0].texto || rows[0].caption || null;
};

const fetchKnowledgeContent = async (db, knowledgeId) => {
  const { rows } = await db.query(
    'SELECT conteudo FROM conhecimento_base WHERE id = $1',
    [knowledgeId]
  );

  if (!rows.length) {
    return null;
  }

  return rows[0].conteudo || null;
};

async function generateMessageEmbedding({ messageId, texto, client = null }) {
  if (!isFeatureEnabled()) {
    return { status: 'skipped', reason: 'feature-disabled' };
  }

  const db = client || pool;
  let content = texto;

  if (!content) {
    content = await fetchMessageContent(db, messageId);
    if (!content) {
      return { status: 'skipped', reason: 'message-not-found' };
    }
  }

  if (shouldSkip(content)) {
    return { status: 'skipped', reason: 'empty-text' };
  }

  try {
    const embedding = await aiProvider.gerarEmbedding(content);

    if (!Array.isArray(embedding) || embedding.length === 0) {
      logger.warn('Embedding vazio recebido', { messageId });
      return { status: 'skipped', reason: 'empty-vector' };
    }

    await db.query('UPDATE mensagens SET embedding = $1 WHERE id = $2', [vectorToPg(embedding), messageId]);

    return { status: 'ok', dimension: embedding.length };
  } catch (error) {
    logger.error('Erro ao gerar embedding para mensagem', {
      messageId,
      error: error.message
    });

    return { status: 'error', error: error.message };
  }
}

async function generateKnowledgeBaseEmbedding({ knowledgeId, conteudo, client = null }) {
  if (!isFeatureEnabled()) {
    return { status: 'skipped', reason: 'feature-disabled' };
  }

  const db = client || pool;
  let content = conteudo;

  if (!content) {
    content = await fetchKnowledgeContent(db, knowledgeId);
    if (!content) {
      return { status: 'skipped', reason: 'knowledge-not-found' };
    }
  }

  if (shouldSkip(content)) {
    return { status: 'skipped', reason: 'empty-text' };
  }

  try {
    const embedding = await aiProvider.gerarEmbedding(content);

    if (!Array.isArray(embedding) || embedding.length === 0) {
      logger.warn('Embedding vazio recebido', { knowledgeId });
      return { status: 'skipped', reason: 'empty-vector' };
    }

    await db.query('UPDATE conhecimento_base SET embedding = $1 WHERE id = $2', [vectorToPg(embedding), knowledgeId]);

    return { status: 'ok', dimension: embedding.length };
  } catch (error) {
    logger.error('Erro ao gerar embedding para conhecimento_base', {
      knowledgeId,
      error: error.message
    });

    return { status: 'error', error: error.message };
  }
}

const fetchCatalogEntry = async (db, catalogId) => {
  const { rows } = await db.query(
    `
      SELECT macro, item, pos, neg
      FROM classificacao_catalogo
      WHERE id = $1
    `,
    [catalogId]
  );

  return rows[0] || null;
};

const arrayFromJson = (jsonValue) => {
  if (Array.isArray(jsonValue)) return jsonValue;
  if (!jsonValue) return [];
  if (typeof jsonValue === 'string') {
    try {
      const parsed = JSON.parse(jsonValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  if (typeof jsonValue === 'object') {
    return Object.values(jsonValue).flat();
  }
  return [];
};

const buildCatalogText = ({ macro, item, pos, neg }) => {
  const positives = arrayFromJson(pos)
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
    .join(', ');
  const negatives = arrayFromJson(neg)
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
    .join(', ');

  let text = `${macro || ''} - ${item || ''}`;
  if (positives) {
    text += `. Palavras-chave positivas: ${positives}.`;
  }
  if (negatives) {
    text += ` Palavras que devem excluir: ${negatives}.`;
  }
  return text;
};

async function generateCatalogEmbedding({ catalogId, macro, item, pos, neg, client = null }) {
  if (!isFeatureEnabled()) {
    return { status: 'skipped', reason: 'feature-disabled' };
  }

  const db = client || pool;
  let payload = { macro, item, pos, neg };

  if (!payload.macro || !payload.item) {
    const dbEntry = await fetchCatalogEntry(db, catalogId);
    if (!dbEntry) {
      return { status: 'skipped', reason: 'catalog-entry-not-found' };
    }
    payload = dbEntry;
  }

  const text = buildCatalogText(payload);
  if (shouldSkip(text)) {
    return { status: 'skipped', reason: 'empty-text' };
  }

  try {
    const embedding = await aiProvider.gerarEmbedding(text);
    if (!Array.isArray(embedding) || embedding.length === 0) {
      logger.warn('Embedding vazio recebido (catalogo)', { catalogId });
      return { status: 'skipped', reason: 'empty-vector' };
    }

    await db.query(
      'UPDATE classificacao_catalogo SET embedding = $1 WHERE id = $2',
      [vectorToPg(embedding), catalogId]
    );

    return { status: 'ok', dimension: embedding.length };
  } catch (error) {
    logger.error('Erro ao gerar embedding para catálogo de classificação', {
      catalogId,
      error: error.message
    });
    return { status: 'error', error: error.message };
  }
}

async function generateTextEmbedding(texto) {
  if (!isFeatureEnabled()) {
    throw new Error('feature-disabled');
  }

  if (shouldSkip(texto)) {
    throw new Error('empty-text');
  }

  const embedding = await aiProvider.gerarEmbedding(texto);
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('empty-vector');
  }
  return embedding;
}

async function generateEmbedding(texto) {
  return generateTextEmbedding(texto);
}

async function processMessageEmbeddingQueue(jobs = []) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return [];
  }

  const results = [];
  for (const job of jobs) {
    try {
      const result = await generateMessageEmbedding(job);
      results.push({ ...job, ...result });
    } catch (error) {
      logger.error('Erro inesperado ao processar fila de embeddings', {
        job,
        error: error.message
      });
      results.push({ ...job, status: 'error', error: error.message });
    }
  }
  return results;
}

module.exports = {
  generateMessageEmbedding,
  generateKnowledgeBaseEmbedding,
  generateCatalogEmbedding,
  generateTextEmbedding,
  generateEmbedding,
  processMessageEmbeddingQueue,
  isFeatureEnabled,
  vectorToPg
};
