// api/routes/health.routes.js
const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middlewares/errorHandler.middleware');
const { authenticateToken } = require('../middlewares/auth.middleware');
const pool = require('../../infrastructure/database/postgres');
const { getRedisClient } = require('../../infrastructure/cache/redis');
const logger = require('../../shared/config/logger.config');
const { getMetricsSnapshot } = require('../../infrastructure/observability/metrics');

/**
 * Health check básico
 * GET /health
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    services: {}
  };

  // Check PostgreSQL
  try {
    const start = Date.now();
    await pool.query('SELECT 1');
    const latency = Date.now() - start;

    health.services.postgres = {
      status: 'healthy',
      latency: `${latency}ms`
    };
  } catch (error) {
    health.status = 'degraded';
    health.services.postgres = {
      status: 'unhealthy',
      error: error.message
    };
    logger.error('PostgreSQL health check failed:', error);
  }

  // Check Redis
  try {
    const redisClient = await getRedisClient();
    const start = Date.now();
    await redisClient.ping();
    const latency = Date.now() - start;

    health.services.redis = {
      status: 'healthy',
      latency: `${latency}ms`
    };
  } catch (error) {
    health.status = 'degraded';
    health.services.redis = {
      status: 'unhealthy',
      error: error.message
    };
    logger.error('Redis health check failed:', error);
  }

  // Check OpenAI
  health.services.openai = {
    status: process.env.OPENAI_API_KEY ? 'configured' : 'not configured'
  };

  // Check Evolution API
  health.services.evolutionApi = {
    status: process.env.EVOLUTION_API_KEY ? 'configured' : 'not configured'
  };

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
}));

/**
 * Readiness check (mais detalhado)
 * GET /ready
 */
router.get('/ready', asyncHandler(async (req, res) => {
  const checks = [];

  // Database check
  try {
    await pool.query('SELECT NOW()');
    checks.push({ name: 'database', status: 'ready' });
  } catch (error) {
    checks.push({ name: 'database', status: 'not ready', error: error.message });
  }

  // Redis check
  try {
    const redisClient = await getRedisClient();
    await redisClient.ping();
    checks.push({ name: 'redis', status: 'ready' });
  } catch (error) {
    checks.push({ name: 'redis', status: 'not ready', error: error.message });
  }

  const allReady = checks.every(check => check.status === 'ready');

  res.status(allReady ? 200 : 503).json({
    ready: allReady,
    checks
  });
}));

/**
 * Liveness check
 * GET /alive
 */
router.get('/alive', (req, res) => {
  res.status(200).json({
    alive: true,
    timestamp: new Date().toISOString()
  });
});

/**
 * Métricas do sistema
 * GET /metrics
 * PROTEGIDO: Requer autenticação
 */
router.get('/metrics', authenticateToken, asyncHandler(async (req, res) => {
  const metrics = {
    timestamp: new Date().toISOString(),
    process: {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      pid: process.pid,
      version: process.version
    },
    system: {
      loadavg: require('os').loadavg(),
      totalmem: require('os').totalmem(),
      freemem: require('os').freemem(),
      cpus: require('os').cpus().length
    },
    database: {},
    cache: {}
  };

  // Database metrics
  try {
    const dbStats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM mensagens) as total_mensagens,
        (SELECT COUNT(*) FROM conversas) as total_conversas,
        (SELECT COUNT(*) FROM contatos) as total_contatos,
        (SELECT pg_database_size(current_database())) as db_size_bytes
    `);

    metrics.database = {
      ...dbStats.rows[0],
      db_size_mb: (dbStats.rows[0].db_size_bytes / 1024 / 1024).toFixed(2)
    };

    // Connection pool stats
    metrics.database.pool = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    };
  } catch (error) {
    metrics.database.error = error.message;
  }

  // Redis metrics
  try {
    const redisClient = await getRedisClient();
    const info = await redisClient.info('stats');

    metrics.cache = {
      connected: true,
      info: info.split('\r\n').filter(line => line.includes(':')).reduce((acc, line) => {
        const [key, value] = line.split(':');
        acc[key] = value;
        return acc;
      }, {})
    };
  } catch (error) {
    metrics.cache.error = error.message;
  }

  metrics.custom = getMetricsSnapshot();

  res.json(metrics);
}));

module.exports = router;
