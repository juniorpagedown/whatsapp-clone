const express = require('express');

const router = express.Router();

const { asyncHandler } = require('../middlewares/errorHandler.middleware');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validation.middleware');
const agenteController = require('../controllers/agente.controller');
const { conversarSchema } = require('../validators/agente.validator');

/**
 * POST /api/agente/conversar
 * Gera resposta usando agente RAG baseado em contexto da conversa
 * PROTEGIDO: Requer autenticação
 */
router.post(
  '/conversar',
  authenticateToken,
  validate(conversarSchema),
  asyncHandler(agenteController.conversar)
);

module.exports = router;
