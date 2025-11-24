const Joi = require('joi');

const listContextosSchema = Joi.object({
  params: Joi.object({
    conversaId: Joi.number()
      .integer()
      .positive()
      .required()
      .messages({
        'number.base': 'conversaId deve ser um número',
        'number.integer': 'conversaId deve ser inteiro',
        'number.positive': 'conversaId deve ser positivo',
        'any.required': 'conversaId é obrigatório'
      })
  }),
  query: Joi.object({
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(20),
    offset: Joi.number()
      .integer()
      .min(0)
      .default(0),
    from: Joi.string()
      .isoDate()
      .optional(),
    to: Joi.string()
      .isoDate()
      .optional(),
    sort: Joi.string()
      .valid('recent', 'oldest', 'sim')
      .default('recent'),
    q: Joi.when('sort', {
      is: 'sim',
      then: Joi.string()
        .trim()
        .min(2)
        .max(2000)
        .required()
        .messages({
          'string.empty': 'q é obrigatório quando sort=sim',
          'any.required': 'q é obrigatório quando sort=sim'
        }),
      otherwise: Joi.string()
        .trim()
        .max(2000)
        .allow('')
        .optional()
    })
  }).custom((value, helpers) => {
    if (value.from && value.to) {
      const fromDate = new Date(value.from);
      const toDate = new Date(value.to);
      if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime())) {
        if (fromDate > toDate) {
          return helpers.error('date.range.invalid');
        }
      }
    }
    return value;
  }, 'date range validation').messages({
    'date.range.invalid': 'Parâmetro "from" deve ser anterior ou igual a "to"'
  })
});

module.exports = {
  listContextosSchema
};
