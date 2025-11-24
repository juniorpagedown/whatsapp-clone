// api/routes/dashboard.routes.js
const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middlewares/errorHandler.middleware');
const { authenticateToken } = require('../middlewares/auth.middleware');
const dashboardController = require('../controllers/dashboard.controller');

/**
 * GET /api/dashboard/stats
 * Retorna estatísticas gerais do sistema para o dashboard
 */
router.get('/stats', authenticateToken, asyncHandler(dashboardController.getDashboardStats));

module.exports = router;
