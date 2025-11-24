// api/validators/mensagem.validator.js
const Joi = require('joi');

const enviarMensagemSchema = Joi.object({
  body: Joi.object({
    chat_id: Joi.string()
      .pattern(/^[0-9]+@[sg]\.whatsapp\.net$/)
      .required()
      .messages({
        'string.pattern.base': 'chat_id inválido (formato: 5511999999999@s.whatsapp.net)',
        'any.required': 'chat_id é obrigatório'
      }),
    texto: Joi.string()
      .min(1)
      .max(4096)
      .required()
      .messages({
        'string.min': 'Texto não pode ser vazio',
        'string.max': 'Texto deve ter no máximo 4096 caracteres',
        'any.required': 'Texto é obrigatório'
      }),
    phone: Joi.string()
      .pattern(/^[0-9]{10,15}$/)
      .required()
      .messages({
        'string.pattern.base': 'Telefone inválido (apenas números, 10-15 dígitos)',
        'any.required': 'Telefone é obrigatório'
      })
  })
});

const buscarMensagensSchema = Joi.object({
  params: Joi.object({
    conversaId: Joi.number()
      .integer()
      .positive()
      .required()
      .messages({
        'number.base': 'conversaId deve ser um número',
        'number.positive': 'conversaId deve ser positivo',
        'any.required': 'conversaId é obrigatório'
      })
  }),
  query: Joi.object({
    cursor: Joi.number()
      .integer()
      .positive()
      .optional(),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(50)
  })
});

const buscarSimilarSchema = Joi.object({
  body: Joi.object({
    query: Joi.string()
      .min(3)
      .max(500)
      .required()
      .messages({
        'string.min': 'Query deve ter no mínimo 3 caracteres',
        'string.max': 'Query deve ter no máximo 500 caracteres',
        'any.required': 'Query é obrigatória'
      }),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(50)
      .default(10)
  })
});

module.exports = {
  enviarMensagemSchema,
  buscarMensagensSchema,
  buscarSimilarSchema
};
