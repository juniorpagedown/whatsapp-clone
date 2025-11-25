// api/controllers/conversation.controller.js
const conversationService = require('../../domain/services/conversation.service');
const messageService = require('../../domain/services/message.service');

const listConversations = async (req, res, next) => {
  try {
    const { search, tipo, limit, offset } = req.query;

    const result = await conversationService.listConversations({
      search,
      tipo,
      limit,
      offset,
      instanceId: req.instance.id
    });

    res.status(200).json({
      data: result.conversations,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset
      }
    });
  } catch (error) {
    next(error);
  }
};

const getConversationMessages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit, offset } = req.query;

    const conversationId = parseInt(id, 10);

    if (!id || Number.isNaN(conversationId)) {
      return res.status(400).json({
        success: false,
        error: { message: 'ID da conversa inválido', statusCode: 400 }
      });
    }

    const messages = await messageService.listMessagesByConversation(conversationId, { limit, offset });

    res.status(200).json({
      data: messages,
      pagination: {
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listConversations,
  getConversationMessages
};
