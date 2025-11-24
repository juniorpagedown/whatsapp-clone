// infrastructure/scheduler/conversa-contexto.scheduler.js
const cron = require('node-cron');
const logger = require('../../shared/config/logger.config');
const { processPendingContexts } = require('../../domain/services/conversaContexto.service');

const cronExpression = process.env.CONVERSA_CONTEXTO_CRON || '*/15 * * * *'; // a cada 15 minutos
const isSchedulerEnabled = () => String(process.env.CONVERSA_CONTEXTO_SCHEDULER_ENABLED || 'true').toLowerCase() !== 'false';

let isRunning = false;

async function runConversationContextJob() {
  if (isRunning) {
    logger.warn('Contexto: job já em execução, pulando ciclo');
    return;
  }

  if (!isSchedulerEnabled()) {
    logger.debug('Contexto: scheduler desativado via configuração');
    return;
  }

  isRunning = true;

  try {
    const stats = await processPendingContexts();

    if (stats.processed > 0) {
      logger.info('Contexto: processamento concluído', stats);
    } else {
      logger.debug('Contexto: nenhuma janela criada neste ciclo', stats);
    }
  } catch (error) {
    logger.error('Contexto: erro durante processamento', { error: error.message });
  } finally {
    isRunning = false;
  }
}

function startConversationContextScheduler() {
  if (!isSchedulerEnabled()) {
    logger.info('Scheduler de contexto desativado via configuração');
    return;
  }

  cron.schedule(cronExpression, () => {
    runConversationContextJob().catch((error) => {
      logger.error('Contexto: erro inesperado no scheduler', { error: error.message });
    });
  });

  runConversationContextJob().catch((error) => {
    logger.error('Contexto: erro inicial no scheduler', { error: error.message });
  });

  logger.info('Scheduler de contexto iniciado', { cronExpression });
}

module.exports = {
  startConversationContextScheduler,
  runConversationContextJob
};
