// api/controllers/message.controller.js
const messageService = require('../../domain/services/message.service');

const listMessages = async (req, res, next) => {
  try {
    const { chatId, limit, before } = req.query;

    if (!chatId) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'chatId é obrigatório',
          statusCode: 400
        }
      });
    }

    const result = await messageService.listMessagesByChatId({
      chatId,
      limit,
      before
    });

    res.status(200).json({
      data: result.messages,
      pagination: {
        limit: result.limit,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor
      }
    });
  } catch (error) {
    next(error);
  }
};

const sendMessage = async (req, res, next) => {
  try {
    const { chat_id: chatIdBody, chatId: chatIdAlias, texto, phone } = req.body || {};
    const chatId = chatIdBody || chatIdAlias;

    if (!chatId || !texto) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'chatId e texto são obrigatórios',
          statusCode: 400
        }
      });
    }

    const result = await messageService.sendTextMessage({
      chatId,
      texto,
      phone
    });

    res.status(200).json({
      success: true,
      data: result.mensagem,
      mensagem: result.mensagem,
      conversationId: result.conversaId
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listMessages,
  sendMessage
};
