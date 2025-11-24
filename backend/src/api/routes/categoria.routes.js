// api/routes/categoria.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../../infrastructure/database/postgres');
const logger = require('../../shared/config/logger.config');
const { AppError } = require('../../shared/errors/AppError');

/**
 * @route   GET /api/categorias/macro
 * @desc    Lista todas as macro categorias
 * @access  Public
 */
router.get('/macro', async (req, res, next) => {
  try {
    const { includeInactive } = req.query;

    const query = includeInactive === 'true'
      ? 'SELECT * FROM macro_categorias ORDER BY ordem, nome'
      : 'SELECT * FROM macro_categorias WHERE is_active = true ORDER BY ordem, nome';

    const result = await pool.query(query);

    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Erro ao listar macro categorias', { error: error.message });
    return next(error);
  }
});

/**
 * @route   GET /api/categorias/macro/:id/subcategorias
 * @desc    Lista subcategorias de uma macro categoria
 * @access  Public
 */
router.get('/macro/:id/subcategorias', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { includeInactive } = req.query;

    const query = includeInactive === 'true'
      ? 'SELECT * FROM subcategorias WHERE macro_categoria_id = $1 ORDER BY ordem, nome'
      : 'SELECT * FROM subcategorias WHERE macro_categoria_id = $1 AND is_active = true ORDER BY ordem, nome';

    const result = await pool.query(query, [id]);

    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Erro ao listar subcategorias', { error: error.message });
    return next(error);
  }
});

/**
 * @route   GET /api/categorias/subcategorias
 * @desc    Lista todas as subcategorias
 * @access  Public
 */
router.get('/subcategorias', async (req, res, next) => {
  try {
    const { includeInactive } = req.query;

    const query = includeInactive === 'true'
      ? `SELECT sc.*, mc.nome as macro_categoria_nome, mc.cor as macro_categoria_cor
         FROM subcategorias sc
         JOIN macro_categorias mc ON sc.macro_categoria_id = mc.id
         ORDER BY mc.ordem, sc.ordem, sc.nome`
      : `SELECT sc.*, mc.nome as macro_categoria_nome, mc.cor as macro_categoria_cor
         FROM subcategorias sc
         JOIN macro_categorias mc ON sc.macro_categoria_id = mc.id
         WHERE sc.is_active = true AND mc.is_active = true
         ORDER BY mc.ordem, sc.ordem, sc.nome`;

    const result = await pool.query(query);

    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Erro ao listar subcategorias', { error: error.message });
    return next(error);
  }
});

/**
 * @route   GET /api/categorias/tree
 * @desc    Retorna árvore completa de categorias
 * @access  Public
 */
router.get('/tree', async (req, res, next) => {
  try {
    // Buscar macro categorias
    const macroResult = await pool.query(
      'SELECT * FROM macro_categorias WHERE is_active = true ORDER BY ordem, nome'
    );

    // Para cada macro, buscar suas subcategorias
    const tree = await Promise.all(
      macroResult.rows.map(async (macro) => {
        const subResult = await pool.query(
          'SELECT * FROM subcategorias WHERE macro_categoria_id = $1 AND is_active = true ORDER BY ordem, nome',
          [macro.id]
        );

        return {
          ...macro,
          subcategorias: subResult.rows
        };
      })
    );

    return res.json({
      success: true,
      data: tree
    });
  } catch (error) {
    logger.error('Erro ao buscar árvore de categorias', { error: error.message });
    return next(error);
  }
});

/**
 * @route   POST /api/categorias/macro
 * @desc    Cria nova macro categoria
 * @access  Private (admin)
 */
router.post('/macro', async (req, res, next) => {
  try {
    const { nome, descricao, icone, cor, ordem } = req.body;

    const result = await pool.query(
      `INSERT INTO macro_categorias (nome, descricao, icone, cor, ordem)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [nome, descricao, icone, cor, ordem || 0]
    );

    return res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') { // unique violation
      return next(new AppError('Macro categoria com este nome já existe', 400));
    }
    logger.error('Erro ao criar macro categoria', { error: error.message });
    return next(error);
  }
});

/**
 * @route   POST /api/categorias/subcategorias
 * @desc    Cria nova subcategoria
 * @access  Private (admin)
 */
router.post('/subcategorias', async (req, res, next) => {
  try {
    const {
      macroCategoriaId,
      nome,
      descricao,
      slaHoras,
      slaHorasCriticas,
      keywords,
      ordem,
      requiresApproval
    } = req.body;

    const result = await pool.query(
      `INSERT INTO subcategorias (
        macro_categoria_id, nome, descricao, sla_horas, sla_horas_criticas,
        keywords, ordem, requires_approval
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        macroCategoriaId,
        nome,
        descricao,
        slaHoras || 24,
        slaHorasCriticas || 2,
        keywords || [],
        ordem || 0,
        requiresApproval || false
      ]
    );

    return res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') { // unique violation
      return next(new AppError('Subcategoria com este nome já existe nesta macro categoria', 400));
    }
    logger.error('Erro ao criar subcategoria', { error: error.message });
    return next(error);
  }
});

/**
 * @route   PUT /api/categorias/macro/:id
 * @desc    Atualiza macro categoria
 * @access  Private (admin)
 */
router.put('/macro/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nome, descricao, icone, cor, ordem, isActive } = req.body;

    const result = await pool.query(
      `UPDATE macro_categorias
       SET nome = $2, descricao = $3, icone = $4, cor = $5, ordem = $6, is_active = $7
       WHERE id = $1
       RETURNING *`,
      [id, nome, descricao, icone, cor, ordem, isActive]
    );

    if (result.rows.length === 0) {
      return next(new AppError('Macro categoria não encontrada', 404));
    }

    return res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Erro ao atualizar macro categoria', { error: error.message });
    return next(error);
  }
});

/**
 * @route   PUT /api/categorias/subcategorias/:id
 * @desc    Atualiza subcategoria
 * @access  Private (admin)
 */
router.put('/subcategorias/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      nome,
      descricao,
      slaHoras,
      slaHorasCriticas,
      keywords,
      ordem,
      requiresApproval,
      isActive
    } = req.body;

    const result = await pool.query(
      `UPDATE subcategorias
       SET nome = $2, descricao = $3, sla_horas = $4, sla_horas_criticas = $5,
           keywords = $6, ordem = $7, requires_approval = $8, is_active = $9
       WHERE id = $1
       RETURNING *`,
      [id, nome, descricao, slaHoras, slaHorasCriticas, keywords, ordem, requiresApproval, isActive]
    );

    if (result.rows.length === 0) {
      return next(new AppError('Subcategoria não encontrada', 404));
    }

    return res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Erro ao atualizar subcategoria', { error: error.message });
    return next(error);
  }
});

module.exports = router;
