// api/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { validate } = require('../middlewares/validation.middleware');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { authLimiter } = require('../middlewares/rateLimit.middleware');
const {
  loginSchema,
  registerSchema,
  changePasswordSchema,
  refreshTokenSchema
} = require('../validators/auth.validator');

/**
 * POST /api/auth/register
 * Registrar novo usuário
 */
router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  authController.register
);

/**
 * POST /api/auth/login
 * Login de usuário
 */
router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  authController.login
);

/**
 * POST /api/auth/refresh
 * Renovar access token usando refresh token
 */
router.post(
  '/refresh',
  validate(refreshTokenSchema),
  authController.refreshToken
);

/**
 * POST /api/auth/change-password
 * Trocar senha (requer autenticação)
 */
router.post(
  '/change-password',
  authenticateToken,
  validate(changePasswordSchema),
  authController.changePassword
);

/**
 * GET /api/auth/me
 * Obter dados do usuário atual
 */
router.get(
  '/me',
  authenticateToken,
  authController.getCurrentUser
);

/**
 * POST /api/auth/logout
 * Logout (adicionar token à blacklist)
 */
router.post(
  '/logout',
  authenticateToken,
  authController.logout
);

module.exports = router;
