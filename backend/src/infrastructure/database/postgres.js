// infrastructure/database/postgres.js
const { Pool } = require('pg');
const logger = require('../../shared/config/logger.config');

// Validar que DB_PASSWORD seja uma string
const dbPassword = process.env.DB_PASSWORD;
if (!dbPassword || typeof dbPassword !== 'string') {
  logger.error('❌ DB_PASSWORD não está configurado corretamente no .env');
  throw new Error('DB_PASSWORD deve ser uma string não vazia');
}

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'whatsapp_clone',
  user: process.env.DB_USER || 'postgres',
  password: dbPassword,
  max: parseInt(process.env.DB_POOL_MAX) || 20,
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT) || 2000,
  // Configurar timezone para todas as conexões
  options: `-c timezone=${process.env.TZ || 'America/Sao_Paulo'}`
});

// Event handlers
pool.on('connect', () => {
  logger.debug('PostgreSQL pool - new client connected');
});

pool.on('error', (err) => {
  logger.error('PostgreSQL pool error:', err);
});

pool.on('remove', () => {
  logger.debug('PostgreSQL pool - client removed');
});

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    logger.error('❌ PostgreSQL connection error:', err);
  } else {
    logger.info('✅ PostgreSQL connected:', res.rows[0].now);
  }
});

module.exports = pool;
