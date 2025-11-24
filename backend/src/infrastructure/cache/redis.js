// infrastructure/cache/redis.js
const redis = require('redis');
const logger = require('../../shared/config/logger.config');

let redisClient = null;

const createRedisClient = () => {
  if (redisClient) {
    return redisClient;
  }

  const client = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD || undefined,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          logger.error('Redis: Too many reconnection attempts');
          return new Error('Too many retries');
        }
        return Math.min(retries * 100, 3000);
      }
    }
  });

  client.on('connect', () => {
    logger.info('✅ Redis connected');
  });

  client.on('error', (err) => {
    logger.error('❌ Redis error:', err);
  });

  client.on('reconnecting', () => {
    logger.warn('⚠️  Redis reconnecting...');
  });

  redisClient = client;
  return client;
};

const getRedisClient = async () => {
  if (!redisClient) {
    redisClient = createRedisClient();
    await redisClient.connect();
  }
  return redisClient;
};

const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
};

module.exports = {
  createRedisClient,
  getRedisClient,
  closeRedis
};
