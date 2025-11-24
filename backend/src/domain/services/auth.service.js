// domain/services/auth.service.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../../infrastructure/database/postgres');
const {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
  ForbiddenError
} = require('../../shared/errors/AppError');
const logger = require('../../shared/config/logger.config');

class AuthService {
  /**
   * Gera tokens JWT (access + refresh)
   */
  generateTokens(user) {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      nome: user.nome
    };

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    const refreshToken = jwt.sign(
      { id: user.id, type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
    );

    return { accessToken, refreshToken };
  }

  /**
   * Registrar novo usuário
   */
  async register(userData) {
    const allowSelfRegistration =
      (process.env.ALLOW_SELF_REGISTRATION || '').toLowerCase() === 'true';

    if (!allowSelfRegistration) {
      logger.warn('Blocked self-registration attempt', { email: userData?.email });
      throw new ForbiddenError('Registro de novos usuários está desabilitado');
    }

    const { nome, email, password, role = 'atendente' } = userData;

    // Verificar se email já existe
    const existingUser = await pool.query(
      'SELECT id FROM usuarios WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      throw new ConflictError('Email já cadastrado');
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(
      password,
      parseInt(process.env.BCRYPT_ROUNDS) || 12
    );

    // Criar usuário
    const result = await pool.query(
      `INSERT INTO usuarios (nome, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nome, email, role, created_at`,
      [nome, email, passwordHash, role]
    );

    const user = result.rows[0];

    logger.info('User registered', { userId: user.id, email: user.email });

    // Gerar tokens
    const tokens = this.generateTokens(user);

    return {
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        created_at: user.created_at
      },
      ...tokens
    };
  }

  /**
   * Login de usuário
   */
  async login(email, password) {
    // Buscar usuário
    const result = await pool.query(
      `SELECT id, nome, email, password_hash, role, is_active
       FROM usuarios
       WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Email ou senha inválidos');
    }

    const user = result.rows[0];

    // Verificar se usuário está ativo
    if (!user.is_active) {
      throw new UnauthorizedError('Usuário desativado');
    }

    // Verificar senha
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      logger.warn('Failed login attempt', { email });
      throw new UnauthorizedError('Email ou senha inválidos');
    }

    // Atualizar last_login
    await pool.query(
      'UPDATE usuarios SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    logger.info('User logged in', { userId: user.id, email: user.email });

    // Gerar tokens
    const tokens = this.generateTokens(user);

    return {
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role
      },
      ...tokens
    };
  }

  /**
   * Refresh token
   */
  async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

      if (decoded.type !== 'refresh') {
        throw new UnauthorizedError('Token inválido');
      }

      // Buscar usuário
      const result = await pool.query(
        'SELECT id, nome, email, role, is_active FROM usuarios WHERE id = $1',
        [decoded.id]
      );

      if (result.rows.length === 0) {
        throw new UnauthorizedError('Usuário não encontrado');
      }

      const user = result.rows[0];

      if (!user.is_active) {
        throw new UnauthorizedError('Usuário desativado');
      }

      // Gerar novos tokens
      const tokens = this.generateTokens(user);

      return tokens;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Refresh token expirado');
      }
      throw new UnauthorizedError('Token inválido');
    }
  }

  /**
   * Trocar senha
   */
  async changePassword(userId, currentPassword, newPassword) {
    // Buscar usuário
    const result = await pool.query(
      'SELECT id, password_hash FROM usuarios WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Usuário não encontrado');
    }

    const user = result.rows[0];

    // Verificar senha atual
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Senha atual incorreta');
    }

    // Hash da nova senha
    const newPasswordHash = await bcrypt.hash(
      newPassword,
      parseInt(process.env.BCRYPT_ROUNDS) || 12
    );

    // Atualizar senha
    await pool.query(
      'UPDATE usuarios SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, userId]
    );

    logger.info('Password changed', { userId });

    return { success: true, message: 'Senha alterada com sucesso' };
  }

  /**
   * Verificar se usuário existe
   */
  async userExists(email) {
    const result = await pool.query(
      'SELECT id FROM usuarios WHERE email = $1',
      [email]
    );

    return result.rows.length > 0;
  }
}

module.exports = new AuthService();
