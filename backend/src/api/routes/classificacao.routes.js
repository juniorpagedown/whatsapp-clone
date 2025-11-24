// api/routes/classificacao.routes.js
const express = require('express');
const multer = require('multer');
const { asyncHandler } = require('../middlewares/errorHandler.middleware');
const { requireAuth, requireAdmin } = require('../middlewares/auth.middleware');
const { createRateLimiter } = require('../middlewares/rateLimit.middleware');
const classificacaoController = require('../controllers/classificacao.controller');

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

const adminRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Limite de requisições para administração de classificações excedido',
  keyGenerator: (req) => {
    return req.user?.id ? `admin-classificacoes:${req.user.id}` : req.ip;
  }
});

const adminGuards = [requireAuth, requireAdmin, adminRateLimiter];

router.get(
  '/',
  adminGuards,
  asyncHandler(classificacaoController.list)
);

router.post(
  '/',
  adminGuards,
  asyncHandler(classificacaoController.create)
);

router.patch(
  '/:id',
  adminGuards,
  asyncHandler(classificacaoController.update)
);

router.delete(
  '/:id',
  adminGuards,
  asyncHandler(classificacaoController.remove)
);

router.post(
  '/:id/toggle',
  adminGuards,
  asyncHandler(classificacaoController.toggle)
);

router.post(
  '/import',
  [...adminGuards, upload.single('file')],
  asyncHandler(classificacaoController.importCsv)
);

router.get(
  '/export',
  adminGuards,
  asyncHandler(classificacaoController.exportCsv)
);

module.exports = router;
