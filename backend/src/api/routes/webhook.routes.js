// api/routes/webhook.routes.js
const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middlewares/errorHandler.middleware');
const { handleEvolutionWebhook } = require('../controllers/webhook.controller');

/**
 * POST /webhooks/evolution
 * Recebe eventos da Evolution API e persiste mensagens/conversas
 */
router.post('/', asyncHandler(handleEvolutionWebhook));
router.post('/:instanceKey/evolution', asyncHandler(handleEvolutionWebhook));
// router.post('/evolution', asyncHandler(handleEvolutionWebhook)); // Deprecated

module.exports = router;
