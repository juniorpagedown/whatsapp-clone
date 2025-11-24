const Joi = require('joi');

const conversarSchema = Joi.object({
  body: Joi.object({
    conversaId: Joi.alternatives()
      .try(
        Joi.number().integer().positive(),
        Joi.string().trim().pattern(/^[0-9]+$/)
      )
      .required()
      .messages({
        'any.required': 'conversaId é obrigatório',
        'string.pattern.base': 'conversaId deve conter apenas números'
      }),
    pergunta: Joi.string()
      .trim()
      .min(2)
      .max(4000)
      .required()
      .messages({
        'string.empty': 'pergunta é obrigatória',
        'string.min': 'pergunta deve ter ao menos 2 caracteres'
      }),
    strategy: Joi.string()
      .valid('recent', 'similar')
      .default('recent'),
    k: Joi.number()
      .integer()
      .min(1)
      .max(10)
      .optional()
  })
});

module.exports = {
  conversarSchema
};
