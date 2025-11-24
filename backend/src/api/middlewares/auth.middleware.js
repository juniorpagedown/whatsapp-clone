// api/middlewares/auth.middleware.js
const jwt = require('jsonwebtoken');
const { UnauthorizedError, ForbiddenError } = require('../../shared/errors/AppError');
const { asyncHandler } = require('./errorHandler.middleware');
const logger = require('../../shared/config/logger.config');

/**
 * Middleware para autenticar token JWT
 */
const authenticateToken = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    throw new UnauthorizedError('Token não fornecido');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Adicionar usuário ao request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      nome: decoded.nome
    };

    logger.debug('User authenticated', { userId: decoded.id, role: decoded.role });
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Token expirado');
    }
    throw new UnauthorizedError('Token inválido');
  }
});

/**
 * Middleware para verificar roles
 */
const requireRole = (...allowedRoles) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new UnauthorizedError('Usuário não autenticado');
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Access denied', {
        userId: req.user.id,
        role: req.user.role,
        requiredRoles: allowedRoles,
        path: req.path
      });
      throw new ForbiddenError('Permissão negada');
    }

    next();
  });
};

/**
 * Middleware opcional - não falha se não tiver token
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      nome: decoded.nome
    };
  } catch (error) {
    // Ignora erro de token inválido
    logger.debug('Optional auth failed:', error.message);
  }

  next();
};

module.exports = {
  authenticateToken,
  requireRole,
  optionalAuth,
  requireAuth: authenticateToken,
  requireAdmin: requireRole('admin')
};
