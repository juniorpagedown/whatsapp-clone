// api/routes/mensagemClassificacao.routes.js
const express = require('express');
const { asyncHandler } = require('../middlewares/errorHandler.middleware');
const { authenticateToken } = require('../middlewares/auth.middleware');
const mensagemClassificacaoController = require('../controllers/mensagemClassificacao.controller');

const router = express.Router({ mergeParams: true });

/**
 * POST /api/mensagens/:id/classificacao
 */
router.post(
  '/:id/classificacao',
  authenticateToken,
  asyncHandler(mensagemClassificacaoController.createClassificacao)
);

/**
 * PUT /api/mensagens/:id/classificacao
 */
router.put(
  '/:id/classificacao',
  authenticateToken,
  asyncHandler(mensagemClassificacaoController.updateClassificacao)
);

/**
 * GET /api/mensagens/:id/classificacao/sugestoes
 */
router.get(
  '/:id/classificacao/sugestoes',
  authenticateToken,
  asyncHandler(mensagemClassificacaoController.getSugestoes)
);

/**
 * GET /api/mensagens/:id/classificacao
 */
router.get(
  '/:id/classificacao',
  authenticateToken,
  asyncHandler(mensagemClassificacaoController.getClassificacao)
);

/**
 * DELETE /api/mensagens/:id/classificacao
 */
router.delete(
  '/:id/classificacao',
  authenticateToken,
  asyncHandler(mensagemClassificacaoController.deleteClassificacao)
);

/**
 * POST /api/classificacao/mensagem
 */
router.post(
  '/mensagem',
  authenticateToken,
  asyncHandler(mensagemClassificacaoController.createClassificacao)
);

/**
 * PUT /api/classificacao/mensagem/:id
 */
router.put(
  '/mensagem/:id',
  authenticateToken,
  asyncHandler(mensagemClassificacaoController.updateClassificacao)
);

/**
 * GET /api/classificacao/mensagem/:id/sugestoes
 */
router.get(
  '/mensagem/:id/sugestoes',
  authenticateToken,
  asyncHandler(mensagemClassificacaoController.getSugestoes)
);

/**
 * GET /api/classificacao/mensagem/:id
 */
router.get(
  '/mensagem/:id',
  authenticateToken,
  asyncHandler(mensagemClassificacaoController.getClassificacao)
);

/**
 * DELETE /api/classificacao/mensagem/:id
 */
router.delete(
  '/mensagem/:id',
  authenticateToken,
  asyncHandler(mensagemClassificacaoController.deleteClassificacao)
);

module.exports = router;
