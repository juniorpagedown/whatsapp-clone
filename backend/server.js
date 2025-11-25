// server.js - Backend refatorado com Sprint 0
require('dotenv').config();

// Permite importar arquivos TypeScript como módulos comuns
if (typeof require !== 'undefined' && require.extensions && !require.extensions['.ts']) {
  require.extensions['.ts'] = require.extensions['.js'];
}
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const net = require('net');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

// Configurações
const logger = require('./src/shared/config/logger.config');
const corsOptions = require('./src/shared/config/cors.config');
const { globalLimiter } = require('./src/api/middlewares/rateLimit.middleware');
const { errorHandler, notFound } = require('./src/api/middlewares/errorHandler.middleware');
const { instanceMiddleware } = require('./src/api/middlewares/instance.middleware');
const socketManager = require('./src/infrastructure/websocket/socketManager');
const { startEmbeddingScheduler } = require('./src/infrastructure/scheduler/embedding.scheduler');
const { startConversationContextScheduler } = require('./src/infrastructure/scheduler/conversa-contexto.scheduler');
const { syncGroupsFromEvolution } = require('./src/domain/services/groupSync.service');

// Routes
const authRoutes = require('./src/api/routes/auth.routes');
const healthRoutes = require('./src/api/routes/health.routes');
const webhookRoutes = require('./src/api/routes/webhook.routes');
const conversationRoutes = require('./src/api/routes/conversation.routes');
const messageRoutes = require('./src/api/routes/message.routes');
const dashboardRoutes = require('./src/api/routes/dashboard.routes');
const agenteRoutes = require('./src/api/routes/agente.routes');
const instanceRoutes = require('./src/api/routes/instance.routes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions });
socketManager.setIO(io);

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3001;

const isPortAvailable = (port) => new Promise((resolve, reject) => {
  const tester = net
    .createServer()
    .once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        reject(err);
      }
    })
    .once('listening', () => {
      tester.close(() => resolve(true));
    })
    .listen(port);
});

const findAvailablePort = async (startPort, maxAttempts = 10) => {
  for (let offset = 0; offset <= maxAttempts; offset += 1) {
    const candidate = startPort + offset;

    try {
      const available = await isPortAvailable(candidate);

      if (available) {
        return candidate;
      }
    } catch (err) {
      logger.error('Erro ao verificar porta disponível', {
        candidate,
        error: err.message
      });
      throw err;
    }
  }

  throw new Error(`Nenhuma porta disponível encontrada a partir da porta ${startPort}`);
};

// ============================================
// MIDDLEWARES
// ============================================

// Security
app.use(helmet());

// CORS
app.use(cors(corsOptions));

// Trust reverse proxy headers (needed for rate limiting behind proxy)
app.set('trust proxy', 1);

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use((req, res, next) => {
  logger.http(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Rate limiting
app.use(globalLimiter);

// ============================================
// ROUTES
// ============================================

// Health checks (sem autenticação)
app.use('/', healthRoutes);

// Auth routes
// Auth routes
app.use('/api/auth', authRoutes);

// Instance routes
app.use('/api/instances', instanceRoutes);

// Webhooks
app.use(['/webhooks', '/webhook'], webhookRoutes);

// Conversations
// Conversations
app.use('/api/conversas', instanceMiddleware, conversationRoutes);

// Messages
// Messages
app.use('/api/mensagens', instanceMiddleware, messageRoutes);

// Dashboard
// Dashboard
app.use('/api/dashboard', instanceMiddleware, dashboardRoutes);

// Auditoria

// Agente conversacional
// Agente conversacional
app.use('/api/agente', instanceMiddleware, agenteRoutes);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use(notFound);

// Error handler (deve ser o último)
app.use(errorHandler);

// ============================================
// WEBSOCKET
// ============================================

io.on('connection', (socket) => {
  logger.info('Client connected', { socketId: socket.id });
  socketManager.registerSocketHandlers(socket);

  socket.on('disconnect', () => {
    logger.info('Client disconnected', { socketId: socket.id });
  });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

const shutdown = async () => {
  logger.info('Shutting down gracefully...');

  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Close Redis
  try {
    const { closeRedis } = require('./src/infrastructure/cache/redis');
    await closeRedis();
  } catch (err) {
    logger.warn('Redis não estava conectado');
  }

  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', { reason, promise });
});

// ============================================
// START SERVER
// ============================================

const startHttpServer = async () => {
  const availablePort = await findAvailablePort(DEFAULT_PORT);

  if (availablePort !== DEFAULT_PORT) {
    logger.warn('Porta em uso detectada, alternando para porta disponível', {
      requestedPort: DEFAULT_PORT,
      availablePort
    });
  }

  process.env.PORT = availablePort.toString();

  server.listen(availablePort, () => {
    logger.info(`🚀 Server running on port ${availablePort}`);
    logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
    logger.info(`🔒 CORS: ${process.env.ALLOWED_ORIGINS}`);
    logger.info(`🤖 AI Provider: ${process.env.EMBEDDING_PROVIDER || 'openai'}`);
    console.log(`
╔════════════════════════════════════════════════════════╗
║     🚀 WhatsApp Clone + IA - Sprint 0                 ║
║                                                        ║
║  Porta: ${availablePort}                                         ║
║  Ambiente: ${process.env.NODE_ENV || 'development'}                                  ║
║  Segurança: JWT + CORS + Rate Limiting ✅             ║
╚════════════════════════════════════════════════════════╝
  `);

    syncGroupsFromEvolution().catch((error) => {
      logger.error('Group sync: erro ao executar sincronização inicial', {
        message: error.message
      });
    });

    startEmbeddingScheduler();
    startConversationContextScheduler();
  });
};

startHttpServer().catch((error) => {
  logger.error('Falha ao iniciar o servidor HTTP', { error: error.message });
  process.exit(1);
});

module.exports = { server, io, app };
