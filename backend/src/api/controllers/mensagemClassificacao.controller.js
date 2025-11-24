// api/controllers/mensagemClassificacao.controller.js
const {
  ValidationError,
  UnauthorizedError
} = require('../../shared/errors/AppError');
const mensagemClassificacaoService = require('../../domain/services/mensagemClassificacao.service');

/**
 * Valida se a macro foi informada no corpo da requisição.
 * @param {any} body
 */
const ensureMacroPresent = (body) => {
  if (!body || typeof body.macro === 'undefined' || body.macro === null) {
    throw new ValidationError('macro é obrigatório');
  }
};

/**
 * POST /api/mensagens/:id/classificacao
 * Registra classificação para uma mensagem.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const resolveMessageId = (req) => {
  const paramId = req.params?.id;
  if (paramId !== undefined) {
    return paramId;
  }
  if (req.body?.messageId !== undefined) {
    return req.body.messageId;
  }
  return null;
};

const createClassificacao = async (req, res, next) => {
  try {
    ensureMacroPresent(req.body);
    const userId = req.user?.id || null;
    if (!userId) {
      throw new UnauthorizedError('Usuário não autenticado');
    }

    const messageId = resolveMessageId(req);
    if (messageId === null || messageId === undefined) {
      throw new ValidationError('messageId é obrigatório');
    }

    const { classificacao, created } = await mensagemClassificacaoService.createOrUpdate(
      messageId,
      req.body,
      userId
    );

    const status = created ? 201 : 200;
    res.status(status).json({
      ok: true,
      message_id: Number(messageId),
      classificacao
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/mensagens/:id/classificacao
 * Atualiza ou cria (idempotente) classificação para uma mensagem.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const updateClassificacao = async (req, res, next) => {
  try {
    ensureMacroPresent(req.body);
    const userId = req.user?.id || null;
    if (!userId) {
      throw new UnauthorizedError('Usuário não autenticado');
    }

    const messageId = resolveMessageId(req);
    if (messageId === null || messageId === undefined) {
      throw new ValidationError('messageId é obrigatório');
    }

    const { classificacao, created } = await mensagemClassificacaoService.createOrUpdate(
      messageId,
      req.body,
      userId
    );

    const status = created ? 201 : 200;
    res.status(status).json({
      ok: true,
      message_id: Number(messageId),
      classificacao
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/mensagens/:id/classificacao
 * Recupera classificação vigente de uma mensagem.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getClassificacao = async (req, res, next) => {
  try {
    const messageId = resolveMessageId(req);
    if (messageId === null || messageId === undefined) {
      throw new ValidationError('messageId é obrigatório');
    }

    const classificacao = await mensagemClassificacaoService.getByMensagem(messageId);
    res.status(200).json({
      message_id: Number(messageId),
      classificacao
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/mensagens/:id/classificacao
 * Remove classificação registrada para uma mensagem.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const deleteClassificacao = async (req, res, next) => {
  try {
    const userId = req.user?.id || null;
    if (!userId) {
      throw new UnauthorizedError('Usuário não autenticado');
    }

    const messageId = resolveMessageId(req);
    if (messageId === null || messageId === undefined) {
      throw new ValidationError('messageId é obrigatório');
    }

    await mensagemClassificacaoService.remove(messageId, userId);

    res.status(200).json({
      ok: true,
      message_id: Number(messageId)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/mensagens/:id/classificacao/sugestoes
 * Retorna sugestões de classificação para uma mensagem.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getSugestoes = async (req, res, next) => {
  try {
    const messageId = resolveMessageId(req);
    if (messageId === null || messageId === undefined) {
      throw new ValidationError('messageId é obrigatório');
    }

    const sugestoes = await mensagemClassificacaoService.getSugestoes(messageId);
    res.status(200).json({
      message_id: Number(messageId),
      sugestoes
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createClassificacao,
  updateClassificacao,
  getClassificacao,
  deleteClassificacao,
  getSugestoes
};
