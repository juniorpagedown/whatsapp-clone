// api/routes/catalogo.routes.js
const express = require('express');

const router = express.Router();
const { asyncHandler } = require('../middlewares/errorHandler.middleware');
const { authenticateToken, requireRole } = require('../middlewares/auth.middleware');
const classificacaoController = require('../controllers/classificacao.controller');

router.get(
  '/classificacao',
  authenticateToken,
  requireRole('auditar', 'admin'),
  asyncHandler(classificacaoController.getCatalog)
);

module.exports = router;
