const conversaContextoService = require('../../domain/services/conversaContexto.service');
const logger = require('../../shared/config/logger.config');

const buildErrorPayload = (error) => {
  const statusCode = error?.statusCode || 500;
  const code = typeof error?.code === 'string' ? error.code : (error?.name || 'internal_error');
  const message = statusCode >= 500
    ? 'Erro interno ao consultar contextos'
    : error?.message || 'Erro ao consultar contextos';

  return {
    statusCode,
    body: {
      error: {
        code,
        message
      }
    }
  };
};

const listConversationContexts = async (req, res) => {
  const conversaId = req.params?.conversaId;
  const numericConversaId = Number(conversaId);
  const {
    limit,
    offset,
    from,
    to,
    sort,
    q
  } = req.query;

  try {
    const servicePayload = sort === 'sim'
      ? await conversaContextoService.searchSimilarByConversa({
        conversaId: numericConversaId,
        queryText: q,
        limit,
        offset,
        from,
        to
      })
      : await conversaContextoService.listByConversa({
        conversaId: numericConversaId,
        limit,
        offset,
        from,
        to,
        sort
      });

    res.status(200).json({
      data: servicePayload.items,
      meta: {
        limit: servicePayload.limit,
        offset: servicePayload.offset,
        count: servicePayload.count,
        has_more: servicePayload.hasMore,
        sort: servicePayload.sort
      }
    });
  } catch (error) {
    logger.error('Erro ao listar contextos de conversa', {
      conversaId: numericConversaId,
      error: error.message,
      code: error.code,
      statusCode: error.statusCode
    });

    const { statusCode, body } = buildErrorPayload(error);
    res.status(statusCode).json(body);
  }
};

const listConversationsWithSummary = async (req, res) => {
  try {
    const result = await conversaContextoService.listConversationsWithContext();
    res.status(200).json({ data: result });
  } catch (error) {
    logger.error('Erro ao listar conversas com contexto', {
      error: error.message
    });
    res.status(500).json({
      error: {
        code: 'internal_error',
        message: 'Erro ao listar conversas com contexto'
      }
    });
  }
};

module.exports = {
  listConversationContexts,
  listConversationsWithSummary
};
