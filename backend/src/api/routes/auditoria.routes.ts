// api/routes/auditoria.routes.ts
const express = require('express');
const router = express.Router();

const { asyncHandler } = require('../middlewares/errorHandler.middleware');
const { authenticateToken, requireRole } = require('../middlewares/auth.middleware');
const auditoriaController = require('../controllers/auditoria.controller.ts');

router.use(authenticateToken);
router.use(requireRole('auditor', 'admin'));

router.get(
  '/conversas-recentes',
  asyncHandler(auditoriaController.listRecentConversations)
);

router.get(
  '/conversas-nao-auditadas',
  asyncHandler(auditoriaController.listNonAuditedConversations)
);

router.get(
  '/conversa/:conversaId/periodo',
  asyncHandler(auditoriaController.getConversationPeriod)
);

router.get(
  '/conversa/:conversaId/mensagens',
  asyncHandler(auditoriaController.getConversationMessages)
);

router.post(
  '/concluir',
  asyncHandler(auditoriaController.concludeAuditoria)
);

router.get(
  '/historico',
  asyncHandler(auditoriaController.getHistorico)
);

router.get(
  '/export',
  asyncHandler(auditoriaController.exportHistorico)
);

router.get(
  '/:auditoriaId/detalhes',
  asyncHandler(auditoriaController.getAuditoriaDetalhes)
);

router.post(
  '/:auditoriaId/reabrir',
  asyncHandler(auditoriaController.reabrirAuditoria)
);

module.exports = router;
