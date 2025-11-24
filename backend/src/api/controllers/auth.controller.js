// api/controllers/auth.controller.js
const authService = require('../../domain/services/auth.service');
const { asyncHandler } = require('../middlewares/errorHandler.middleware');

class AuthController {
  /**
   * POST /api/auth/register
   */
  register = asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);

    res.status(201).json({
      success: true,
      data: result
    });
  });

  /**
   * POST /api/auth/login
   */
  login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await authService.login(email, password);

    res.json({
      success: true,
      data: result
    });
  });

  /**
   * POST /api/auth/refresh
   */
  refreshToken = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const result = await authService.refreshToken(refreshToken);

    res.json({
      success: true,
      data: result
    });
  });

  /**
   * POST /api/auth/change-password
   */
  changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const result = await authService.changePassword(
      req.user.id,
      currentPassword,
      newPassword
    );

    res.json({
      success: true,
      data: result
    });
  });

  /**
   * GET /api/auth/me
   */
  getCurrentUser = asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: {
        user: req.user
      }
    });
  });

  /**
   * POST /api/auth/logout
   */
  logout = asyncHandler(async (req, res) => {
    // Em produção, adicionar token à blacklist no Redis
    res.json({
      success: true,
      message: 'Logout realizado com sucesso'
    });
  });
}

module.exports = new AuthController();
