// infrastructure/queues/embedding.queue.js
const Bull = require('bull');
const logger = require('../../shared/config/logger.config');

const EMBEDDING_JOB = {
  MESSAGE: 'embedding:message',
  KNOWLEDGE_BASE: 'embedding:knowledge-base'
};

const queueName = process.env.EMBEDDING_QUEUE_NAME || 'embedding-jobs';

const embeddingQueue = new Bull(queueName, {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  },
  prefix: process.env.REDIS_QUEUE_PREFIX || 'bull',
  defaultJobOptions: {
    attempts: parseInt(process.env.EMBEDDING_JOB_ATTEMPTS || '3', 10),
    backoff: {
      type: 'exponential',
      delay: parseInt(process.env.EMBEDDING_JOB_BACKOFF || '10000', 10)
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

embeddingQueue.on('error', (error) => {
  logger.error('Embedding queue error', { error: error.message });
});

embeddingQueue.on('waiting', (jobId) => {
  logger.debug('Embedding queue waiting job', { jobId });
});

embeddingQueue.on('stalled', (job) => {
  logger.warn('Embedding queue stalled job', { jobId: job.id });
});

module.exports = {
  embeddingQueue,
  EMBEDDING_JOB
};
