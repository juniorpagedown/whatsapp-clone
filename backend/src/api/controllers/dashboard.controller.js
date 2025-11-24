// api/controllers/dashboard.controller.js
const pool = require('../../infrastructure/database/postgres');
const logger = require('../../shared/config/logger.config');
const { AppError } = require('../../shared/errors/AppError');

const parseCount = (queryResult) => {
  const value = queryResult?.rows?.[0]?.count;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getDashboardStats = async (req, res, next) => {
  try {
    const [
      totalMensagensResult,
      totalConversasResult,
      mensagensComEmbeddingResult,
      totalConhecimentoResult,
      totalContatosResult,
      totalGruposResult
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM mensagens'),
      pool.query('SELECT COUNT(*) FROM conversas'),
      pool.query('SELECT COUNT(*) FROM mensagens WHERE embedding IS NOT NULL'),
      pool.query('SELECT COUNT(*) FROM conhecimento_base WHERE is_active IS DISTINCT FROM FALSE'),
      pool.query('SELECT COUNT(*) FROM contatos'),
      pool.query('SELECT COUNT(*) FROM grupos')
    ]);

    return res.json({
      success: true,
      data: {
        total_mensagens: parseCount(totalMensagensResult),
        total_conversas: parseCount(totalConversasResult),
        mensagens_com_embedding: parseCount(mensagensComEmbeddingResult),
        conhecimentos_ativos: parseCount(totalConhecimentoResult),
        total_contatos: parseCount(totalContatosResult),
        total_grupos: parseCount(totalGruposResult)
      }
    });
  } catch (error) {
    logger.error('Erro ao carregar estatísticas do dashboard', { error: error.message });
    next(new AppError('Falha ao carregar estatísticas do dashboard', 500));
  }
};

module.exports = {
  getDashboardStats
};
