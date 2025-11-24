// api/validators/auth.validator.js
const Joi = require('joi');

const loginSchema = Joi.object({
  body: Joi.object({
    email: Joi.string()
      .email()
      .required()
      .messages({
        'string.email': 'Email inválido',
        'any.required': 'Email é obrigatório'
      }),
    password: Joi.string()
      .min(6)
      .required()
      .messages({
        'string.min': 'Senha deve ter no mínimo 6 caracteres',
        'any.required': 'Senha é obrigatória'
      })
  })
});

const registerSchema = Joi.object({
  body: Joi.object({
    nome: Joi.string()
      .min(3)
      .max(255)
      .required()
      .messages({
        'string.min': 'Nome deve ter no mínimo 3 caracteres',
        'string.max': 'Nome deve ter no máximo 255 caracteres',
        'any.required': 'Nome é obrigatório'
      }),
    email: Joi.string()
      .email()
      .required()
      .messages({
        'string.email': 'Email inválido',
        'any.required': 'Email é obrigatório'
      }),
    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .required()
      .messages({
        'string.min': 'Senha deve ter no mínimo 8 caracteres',
        'string.pattern.base': 'Senha deve conter letras maiúsculas, minúsculas e números',
        'any.required': 'Senha é obrigatória'
      }),
    role: Joi.string()
      .valid('admin', 'supervisor', 'atendente')
      .default('atendente')
  })
});

const changePasswordSchema = Joi.object({
  body: Joi.object({
    currentPassword: Joi.string()
      .required()
      .messages({
        'any.required': 'Senha atual é obrigatória'
      }),
    newPassword: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .required()
      .messages({
        'string.min': 'Nova senha deve ter no mínimo 8 caracteres',
        'string.pattern.base': 'Nova senha deve conter letras maiúsculas, minúsculas e números',
        'any.required': 'Nova senha é obrigatória'
      })
  })
});

const refreshTokenSchema = Joi.object({
  body: Joi.object({
    refreshToken: Joi.string()
      .required()
      .messages({
        'any.required': 'Refresh token é obrigatório'
      })
  })
});

module.exports = {
  loginSchema,
  registerSchema,
  changePasswordSchema,
  refreshTokenSchema
};
