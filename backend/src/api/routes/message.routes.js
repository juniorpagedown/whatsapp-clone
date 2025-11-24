// api/routes/message.routes.js
const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middlewares/errorHandler.middleware');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { listMessages, sendMessage } = require('../controllers/message.controller');

/**
 * GET /api/mensagens
 * Lista mensagens por chatId
 * PROTEGIDO: Requer autenticação
 */
router.get('/', authenticateToken, asyncHandler(listMessages));

/**
 * POST /api/mensagens/send
 * Alias para envio de mensagens (preferido)
 * PROTEGIDO: Requer autenticação
 */
router.post('/send', authenticateToken, asyncHandler(sendMessage));

/**
 * POST /api/mensagens/enviar
 * Compatibilidade com rota legada
 * PROTEGIDO: Requer autenticação
 */
router.post('/enviar', authenticateToken, asyncHandler(sendMessage));

module.exports = router;
