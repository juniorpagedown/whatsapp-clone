// infrastructure/scheduler/embedding.scheduler.js
const cron = require('node-cron');
const pool = require('../database/postgres');
const { embeddingQueue, EMBEDDING_JOB } = require('../queues/embedding.queue');
const logger = require('../../shared/config/logger.config');

const isFeatureEnabled = () => String(process.env.FEATURE_EMBEDDING || '').toLowerCase() === 'true';

const batchSize = parseInt(process.env.EMBEDDING_BACKFILL_BATCH || '50', 10);
const maxPerRun = parseInt(process.env.EMBEDDING_BACKFILL_MAX_PER_RUN || '500', 10);
const cronExpression = process.env.EMBEDDING_BACKFILL_CRON || '0 * * * *'; // a cada hora
const cronKnowledgeExpression = process.env.EMBEDDING_KB_CRON || '30 2 * * *'; // diariamente às 02:30

let isBackfillRunning = false;
let isKnowledgeRunning = false;

const addMessageJobs = async (rows) => {
  if (!rows.length) {
    return;
  }

  await Promise.all(rows.map((row) => embeddingQueue.add(
    EMBEDDING_JOB.MESSAGE,
    { messageId: row.id },
    { jobId: `message:${row.id}` }
  )));
};

const addKnowledgeJobs = async (rows) => {
  if (!rows.length) {
    return;
  }

  await Promise.all(rows.map((row) => embeddingQueue.add(
    EMBEDDING_JOB.KNOWLEDGE_BASE,
    { knowledgeId: row.id },
    { jobId: `knowledge:${row.id}` }
  )));
};

async function enqueueMissingMessageEmbeddings() {
  if (!isFeatureEnabled()) {
    return;
  }

  if (isBackfillRunning) {
    logger.warn('Scheduler: backfill de mensagens já em execução, pulando ciclo');
    return;
  }

  isBackfillRunning = true;

  try {
    let queued = 0;

    while (queued < maxPerRun) {
      const { rows } = await pool.query(
        `
          SELECT id
          FROM mensagens
          WHERE embedding IS NULL
            AND (texto IS NOT NULL OR caption IS NOT NULL)
          ORDER BY id
          LIMIT $1
        `,
        [batchSize]
      );

      if (!rows.length) {
        if (queued === 0) {
          logger.debug('Scheduler: nenhuma mensagem pendente para embedding');
        }
        break;
      }

      await addMessageJobs(rows);

      queued += rows.length;

      if (rows.length < batchSize) {
        break;
      }
    }

    if (queued > 0) {
      logger.info('Scheduler: mensagens enfileiradas para embeddings', { total: queued });
    }
  } catch (error) {
    logger.error('Scheduler: erro ao enfileirar mensagens', { error: error.message });
  } finally {
    isBackfillRunning = false;
  }
}

async function enqueueKnowledgeBaseEmbeddings() {
  if (!isFeatureEnabled()) {
    return;
  }

  if (isKnowledgeRunning) {
    logger.warn('Scheduler: backfill de conhecimento já em execução, pulando ciclo');
    return;
  }

  isKnowledgeRunning = true;

  try {
    const { rows } = await pool.query(
      `
        SELECT id
        FROM conhecimento_base
        WHERE embedding IS NULL
        ORDER BY id
      `
    );

    if (!rows.length) {
      logger.debug('Scheduler: base de conhecimento sem pendências de embedding');
      return;
    }

    await addKnowledgeJobs(rows);

    logger.info('Scheduler: itens de conhecimento enfileirados para embeddings', {
      total: rows.length
    });
  } catch (error) {
    logger.error('Scheduler: erro ao enfileirar conhecimento', { error: error.message });
  } finally {
    isKnowledgeRunning = false;
  }
}

function startEmbeddingScheduler() {
  const schedulerEnabled = String(process.env.EMBEDDING_SCHEDULER_ENABLED || 'true').toLowerCase() !== 'false';

  if (!schedulerEnabled) {
    logger.info('Scheduler de embeddings desativado via configuração');
    return;
  }

  if (!isFeatureEnabled()) {
    logger.info('Scheduler de embeddings não iniciado porque FEATURE_EMBEDDING está desativado');
    return;
  }

  cron.schedule(cronExpression, () => {
    enqueueMissingMessageEmbeddings().catch((error) => {
      logger.error('Scheduler: erro inesperado no ciclo de mensagens', { error: error.message });
    });
  });

  cron.schedule(cronKnowledgeExpression, () => {
    enqueueKnowledgeBaseEmbeddings().catch((error) => {
      logger.error('Scheduler: erro inesperado no ciclo de conhecimento', { error: error.message });
    });
  });

  // Executa uma vez na inicialização
  enqueueMissingMessageEmbeddings().catch((error) => {
    logger.error('Scheduler: erro inicial ao enfileirar mensagens', { error: error.message });
  });

  enqueueKnowledgeBaseEmbeddings().catch((error) => {
    logger.error('Scheduler: erro inicial ao enfileirar conhecimento', { error: error.message });
  });

  logger.info('Scheduler de embeddings iniciado', {
    cronExpression,
    cronKnowledgeExpression,
    batchSize,
    maxPerRun
  });
}

module.exports = {
  startEmbeddingScheduler,
  enqueueMissingMessageEmbeddings,
  enqueueKnowledgeBaseEmbeddings
};
