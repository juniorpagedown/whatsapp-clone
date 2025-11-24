const Joi = require('joi');

const corHexRegex = /^#([0-9A-Fa-f]{6})$/;

const descricaoField = Joi.string().trim().max(500).allow('', null);

const prioridadeField = Joi.number().integer().min(-999).max(999).default(0);

const macroField = Joi.string().trim().min(2).max(60);

const itemField = Joi.string().trim().min(2).max(60);

const createSchema = Joi.object({
  macro: macroField.required(),
  item: itemField.required(),
  descricao: descricaoField.optional(),
  cor_hex: Joi.string().trim().pattern(corHexRegex).optional(),
  prioridade: prioridadeField,
  ativo: Joi.boolean().optional()
});

const updateSchema = Joi.object({
  macro: macroField.optional(),
  item: itemField.optional(),
  descricao: descricaoField.optional(),
  cor_hex: Joi.string().trim().pattern(corHexRegex).optional(),
  prioridade: prioridadeField.optional(),
  ativo: Joi.boolean().optional()
}).min(1);

const querySchema = Joi.object({
  q: Joi.string().trim().allow(''),
  ativo: Joi.string().valid('true', 'false', 'all', 'deleted').default('true'),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(200).default(20),
  sort: Joi.string().trim().allow('')
});

module.exports = {
  createSchema,
  updateSchema,
  querySchema
};
