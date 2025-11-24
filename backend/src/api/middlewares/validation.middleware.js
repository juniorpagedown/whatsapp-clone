// api/middlewares/validation.middleware.js
const Joi = require('joi');
const { ValidationError } = require('../../shared/errors/AppError');

/**
 * Middleware para validar request com schema Joi
 */
const validate = (schema) => {
  return (req, res, next) => {
    const validationOptions = {
      abortEarly: false, // Retorna todos os erros
      allowUnknown: true, // Permite campos extras
      stripUnknown: true  // Remove campos extras
    };

    const { error, value } = schema.validate(
      {
        body: req.body,
        query: req.query,
        params: req.params
      },
      validationOptions
    );

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/['"]/g, ''),
        type: detail.type
      }));

      throw new ValidationError('Erro de validação', details);
    }

    // Substituir request com valores validados/sanitizados
    req.body = value.body || req.body;
    req.query = value.query || req.query;
    req.params = value.params || req.params;

    next();
  };
};

/**
 * Validação apenas do body
 */
const validateBody = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/['"]/g, ''),
        type: detail.type
      }));

      throw new ValidationError('Erro de validação do body', details);
    }

    req.body = value;
    next();
  };
};

/**
 * Validação apenas da query string
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/['"]/g, ''),
        type: detail.type
      }));

      throw new ValidationError('Erro de validação da query', details);
    }

    req.query = value;
    next();
  };
};

/**
 * Validação apenas dos params
 */
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/['"]/g, ''),
        type: detail.type
      }));

      throw new ValidationError('Erro de validação dos parâmetros', details);
    }

    req.params = value;
    next();
  };
};

module.exports = {
  validate,
  validateBody,
  validateQuery,
  validateParams
};
