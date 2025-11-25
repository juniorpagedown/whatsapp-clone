const logger = require('../../shared/config/logger.config');
const { AppError } = require('../../shared/errors/AppError');
const pool = require('../../infrastructure/database/postgres');
const webhookService = require('../../domain/services/webhook.service');

// New helper to get instance ID
const getInstanceByKey = async (client, key) => {
  const res = await client.query('SELECT id, name FROM whatsapp_instances WHERE instance_key = $1', [key]);
  return res.rows[0];
};

const handleEvolutionWebhook = async (req, res, next) => {
  try {
    const { instanceKey } = req.params;
    if (!instanceKey) {
      throw new AppError('Instance Key is required in URL', 400);
    }

    const configuredToken = process.env.EVOLUTION_WEBHOOK_TOKEN;
    const allowWithoutToken = String(process.env.EVOLUTION_WEBHOOK_ALLOW_NO_TOKEN || '').toLowerCase() === 'true';

    if (configuredToken) {
      const incomingToken =
        req.headers['x-webhook-token'] ||
        req.headers['x-hook-secret'] ||
        req.headers['x-evolution-token'] ||
        req.headers['token'] ||
        (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '').trim() : null) ||
        req.headers['apikey'] ||
        req.query.token ||
        req.query.secret ||
        req.body?.token ||
        req.body?.secret;

      if (!incomingToken) {
        if (allowWithoutToken) {
          logger.warn('Webhook Evolution: token ausente mas permitido por configuração');
        } else {
          logger.warn('Webhook Evolution: token inválido');
          throw new AppError('Webhook token inválido', 401);
        }
      } else if (incomingToken !== configuredToken) {
        logger.warn('Webhook Evolution: token inválido');
        throw new AppError('Webhook token inválido', 401);
      }
    }

    const events = webhookService.parsePayload(req.body);
    if (!events.length) {
      return res.status(200).json({ received: false, reason: 'empty_payload' });
    }

    // Look up instance ID
    // We need a client to query DB. 
    // Ideally, getInstanceByKey should be in a service too, but it's small enough here for now.
    const client = await pool.connect();
    let instanceId;
    try {
      const instance = await getInstanceByKey(client, instanceKey);
      if (!instance) {
        logger.warn(`Webhook received for unknown instance: ${instanceKey}`);
        return res.status(404).json({ error: 'Instance not found' });
      }
      instanceId = instance.id;
    } finally {
      client.release();
    }

    const processed = await webhookService.processWebhookEvents(events, instanceKey, instanceId);

    logger.info('Webhook Evolution: mensagens processadas', { processed });
    return res.status(200).json({ received: true, processed });
  } catch (error) {
    logger.error('Erro no webhook da Evolution API', { error: error.message });
    return next(error);
  }
};

module.exports = { handleEvolutionWebhook };
