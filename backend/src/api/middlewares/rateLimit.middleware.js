// api/middlewares/rateLimit.middleware.js
const rateLimit = require('express-rate-limit');
const logger = require('../../shared/config/logger.config');

let redisStoreFactory = null;
let redisStoreClient = null;

const getRedisStore = () => {
  if (redisStoreFactory !== null) {
    return redisStoreFactory;
  }

  if (!process.env.REDIS_URL) {
    redisStoreFactory = false;
    return null;
  }

  try {
    const { createRedisClient } = require('../../infrastructure/cache/redis');
    const RedisStore = require('rate-limit-redis');

    if (!redisStoreClient) {
      redisStoreClient = createRedisClient();
      redisStoreClient.connect().catch((err) => {
        logger.error('Erro ao conectar Redis para rate-limit', { error: err.message });
      });
    }

    redisStoreFactory = new RedisStore({
      sendCommand: (...args) => redisStoreClient.sendCommand(args),
      prefix: 'rate-limit'
    });
  } catch (error) {
    redisStoreFactory = false;
    logger.warn('Não foi possível inicializar Redis como store do rate-limit', {
      error: error.message
    });
  }

  return redisStoreFactory || null;
};

/**
 * Cria um rate limiter customizado
 */
const createRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutos
    max = 100,
    message = 'Muitas requisições deste IP, tente novamente mais tarde',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = null
  } = options;

  const limiterOptions = {
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true, // Retorna rate limit info nos headers
    legacyHeaders: false,
    skipSuccessfulRequests,
    skipFailedRequests,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method
      });
      res.status(429).json({
        success: false,
        error: {
          message,
          statusCode: 429,
          retryAfter: Math.ceil(windowMs / 1000)
        }
      });
    }
  };

  const redisStore = getRedisStore();
  if (redisStore) {
    limiterOptions.store = redisStore;
  }

  // Key generator customizado
  if (keyGenerator) {
    limiterOptions.keyGenerator = keyGenerator;
  }

  return rateLimit(limiterOptions);
};

/**
 * Rate limiter global (todas as rotas)
 */
const globalLimiter = process.env.RATE_LIMIT_MAX_REQUESTS === '0'
  ? (req, res, next) => next()
  : createRateLimiter({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
      message: 'Muitas requisições, tente novamente mais tarde'
    });

/**
 * Rate limiter para autenticação (mais restritivo)
 */
const authLimiter = process.env.RATE_LIMIT_AUTH_MAX === '0'
  ? (req, res, next) => next()
  : createRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 5,
      message: 'Muitas tentativas de login, tente novamente em 15 minutos',
      skipSuccessfulRequests: true, // Só conta falhas
      keyGenerator: (req) => {
        // Rate limit por email ao invés de IP
        return req.body.email || req.ip;
      }
    });

/**
 * Rate limiter para API (rotas /api/*)
 */
const apiLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 30,
  message: 'Rate limit excedido para API'
});

/**
 * Rate limiter para webhooks
 */
const webhookLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100,
  message: 'Muitas requisições de webhook'
});

/**
 * Rate limiter para busca/queries pesadas
 */
const searchLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 10,
  message: 'Limite de buscas excedido'
});

/**
 * Rate limiter por usuário autenticado
 */
const userLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
  keyGenerator: (req) => {
    return req.user?.id ? `user:${req.user.id}` : req.ip;
  },
  message: 'Limite de requisições por usuário excedido'
});

module.exports = {
  createRateLimiter,
  globalLimiter,
  authLimiter,
  apiLimiter,
  webhookLimiter,
  searchLimiter,
  userLimiter
};
