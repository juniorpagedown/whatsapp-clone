// api/middlewares/errorHandler.middleware.js
const logger = require('../../shared/config/logger.config');
const { AppError } = require('../../shared/errors/AppError');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.stack = err.stack;

  // Log do erro
  logger.error('Error:', {
    message: error.message,
    stack: error.stack,
    statusCode: error.statusCode,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id
  });

  // Erro operacional (esperado)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        statusCode: err.statusCode,
        ...(err.details && { details: err.details }),
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      }
    });
  }

  // Erro de validação do Joi
  if (err.name === 'ValidationError' && err.isJoi) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Erro de validação',
        statusCode: 400,
        details: err.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      }
    });
  }

  // Erro do PostgreSQL
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique violation
        return res.status(409).json({
          success: false,
          error: {
            message: 'Registro duplicado',
            statusCode: 409,
            field: err.constraint
          }
        });

      case '23503': // Foreign key violation
        return res.status(400).json({
          success: false,
          error: {
            message: 'Referência inválida',
            statusCode: 400,
            field: err.constraint
          }
        });

      case '23502': // Not null violation
        return res.status(400).json({
          success: false,
          error: {
            message: 'Campo obrigatório faltando',
            statusCode: 400,
            field: err.column
          }
        });

      case 'ECONNREFUSED':
        return res.status(503).json({
          success: false,
          error: {
            message: 'Serviço indisponível',
            statusCode: 503
          }
        });
    }
  }

  // Erro do JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Token inválido',
        statusCode: 401
      }
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Token expirado',
        statusCode: 401
      }
    });
  }

  // Erro genérico (não esperado)
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Erro interno do servidor'
    : err.message;

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      statusCode,
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack,
        details: err
      })
    }
  });
};

// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 404 handler
const notFound = (req, res, next) => {
  const error = new Error(`Rota não encontrada - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFound
};
