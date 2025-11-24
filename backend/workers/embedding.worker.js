/* eslint-disable no-console */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const logger = require('../src/shared/config/logger.config');
const { embeddingQueue, EMBEDDING_JOB } = require('../src/infrastructure/queues/embedding.queue');
const {
  generateMessageEmbedding,
  generateKnowledgeBaseEmbedding,
  generateCatalogEmbedding
} = require('../src/domain/services/embedding.service');
const pool = require('../src/infrastructure/database/postgres');
const { closeRedis } = require('../src/infrastructure/cache/redis');

const messageConcurrency = parseInt(process.env.QUEUE_EMBEDDING_CONCURRENCY, 10) || 5;
const knowledgeConcurrency = parseInt(process.env.QUEUE_KB_CONCURRENCY || process.env.QUEUE_EMBEDDING_CONCURRENCY, 10) || 3;
const catalogConcurrency = parseInt(process.env.QUEUE_CATALOG_CONCURRENCY || process.env.QUEUE_EMBEDDING_CONCURRENCY, 10) || 2;

embeddingQueue.process(EMBEDDING_JOB.MESSAGE, messageConcurrency, async (job) => {
  const result = await generateMessageEmbedding(job.data);

  if (result.status === 'error') {
    throw new Error(result.error || 'embedding-failed');
  }

  return result;
});

embeddingQueue.process(EMBEDDING_JOB.KNOWLEDGE_BASE, knowledgeConcurrency, async (job) => {
  const result = await generateKnowledgeBaseEmbedding(job.data);

  if (result.status === 'error') {
    throw new Error(result.error || 'knowledge-embedding-failed');
  }

  return result;
});

embeddingQueue.process(EMBEDDING_JOB.CATALOG, catalogConcurrency, async (job) => {
  const result = await generateCatalogEmbedding(job.data);

  if (result.status === 'error') {
    throw new Error(result.error || 'catalog-embedding-failed');
  }

  return result;
});

embeddingQueue.on('completed', (job, result) => {
  logger.debug('Embedding job concluído', {
    jobId: job.id,
    name: job.name,
    result
  });
});

embeddingQueue.on('failed', (job, err) => {
  logger.error('Embedding job falhou', {
    jobId: job.id,
    name: job.name,
    error: err.message
  });
});

const shutdown = async () => {
  logger.info('Encerrando embedding worker...');

  try {
    await embeddingQueue.close();
  } catch (error) {
    logger.warn('Erro ao fechar fila de embeddings', { error: error.message });
  }

  try {
    await pool.end();
  } catch (error) {
    logger.warn('Erro ao encerrar pool PostgreSQL', { error: error.message });
  }

  try {
    await closeRedis();
  } catch (error) {
    logger.warn('Erro ao encerrar Redis', { error: error.message });
  }

  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

logger.info('Embedding worker iniciado', {
  messageConcurrency,
  knowledgeConcurrency,
  catalogConcurrency
});
