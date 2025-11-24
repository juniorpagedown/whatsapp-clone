// infrastructure/cache/cache.service.js
const { getRedisClient } = require('./redis');
const crypto = require('crypto');
const logger = require('../../shared/config/logger.config');

class CacheService {
  constructor() {
    this.defaultTTL = 300; // 5 minutos
    this.client = null;
  }

  async init() {
    if (!this.client) {
      this.client = await getRedisClient();
    }
  }

  generateKey(prefix, params) {
    const hash = crypto
      .createHash('md5')
      .update(JSON.stringify(params))
      .digest('hex');
    return `${prefix}:${hash}`;
  }

  async get(key) {
    try {
      await this.init();
      const cached = await this.client.get(key);

      if (cached) {
        logger.debug(`Cache HIT: ${key}`);
        return JSON.parse(cached);
      }

      logger.debug(`Cache MISS: ${key}`);
      return null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    try {
      await this.init();
      await this.client.setEx(key, ttl, JSON.stringify(value));
      logger.debug(`Cache SET: ${key} (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  async delete(pattern) {
    try {
      await this.init();

      if (pattern.includes('*')) {
        // Pattern matching - buscar e deletar
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(keys);
          logger.debug(`Cache DELETE: ${keys.length} keys matching ${pattern}`);
        }
      } else {
        // Chave específica
        await this.client.del(pattern);
        logger.debug(`Cache DELETE: ${pattern}`);
      }
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  async invalidateConversa(conversaId) {
    await this.delete(`conversa:${conversaId}:*`);
    await this.delete(`conversas:list:*`);
  }

  async invalidateContato(contatoId) {
    await this.delete(`contato:${contatoId}:*`);
    await this.delete(`contatos:list:*`);
  }

  async flush() {
    try {
      await this.init();
      await this.client.flushDb();
      logger.warn('Cache FLUSHED');
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }
}

module.exports = new CacheService();
