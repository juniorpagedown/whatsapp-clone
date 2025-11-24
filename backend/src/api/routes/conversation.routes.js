// api/routes/conversation.routes.js
const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middlewares/errorHandler.middleware');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validation.middleware');
const {
  listConversations,
  getConversationMessages
} = require('../controllers/conversation.controller');
const conversaContextoController = require('../controllers/conversaContexto.controller');
const { listContextosSchema } = require('../validators/conversaContexto.validator');

/**
 * GET /api/conversas
 * Lista conversas com informações resumidas
 * PROTEGIDO: Requer autenticação
 */
router.get('/', authenticateToken, asyncHandler(listConversations));

router.get(
  '/contextos/disponiveis',
  authenticateToken,
  asyncHandler(conversaContextoController.listConversationsWithSummary)
);

/**
 * GET /api/conversas/:id/mensagens
 * Lista mensagens de uma conversa específica
 * PROTEGIDO: Requer autenticação
 */
router.get('/:id/mensagens', authenticateToken, asyncHandler(getConversationMessages));

/**
 * GET /api/conversas/:conversaId/contextos
 * Lista contextos resumidos de uma conversa
 * PROTEGIDO: Requer autenticação
 */
router.get(
  '/:conversaId/contextos',
  authenticateToken,
  validate(listContextosSchema),
  asyncHandler(conversaContextoController.listConversationContexts)
);

module.exports = router;
