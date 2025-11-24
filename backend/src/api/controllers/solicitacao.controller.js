// api/controllers/solicitacao.controller.js
const solicitacaoService = require('../../domain/services/solicitacao.service');
const logger = require('../../shared/config/logger.config');

/**
 * Cria nova solicitação
 * POST /api/solicitacoes
 */
async function criarSolicitacao(req, res, next) {
  try {
    const {
      conversaId,
      mensagemOrigemId,
      contatoId,
      titulo,
      descricao,
      subcategoriaId,
      macroCategoriaId,
      prioridade,
      usuarioResponsavelId,
      tags,
      metadata
    } = req.body;

    const solicitacao = await solicitacaoService.criarSolicitacao({
      conversaId,
      mensagemOrigemId,
      contatoId,
      titulo,
      descricao,
      subcategoriaId,
      macroCategoriaId,
      prioridade,
      classificacaoAutomatica: false,
      usuarioResponsavelId,
      tags,
      metadata
    });

    return res.status(201).json({
      success: true,
      data: solicitacao
    });
  } catch (error) {
    logger.error('Erro ao criar solicitação', { error: error.message });
    return next(error);
  }
}

/**
 * Cria solicitação com classificação automática
 * POST /api/solicitacoes/auto-classificar
 */
async function criarComClassificacaoAutomatica(req, res, next) {
  try {
    const {
      conversaId,
      mensagemOrigemId,
      contatoId,
      texto,
      prioridade
    } = req.body;

    // Classificar mensagem
    const classificacao = await solicitacaoService.classificarMensagemComIA(texto);

    // Criar solicitação com classificação
    const solicitacao = await solicitacaoService.criarSolicitacao({
      conversaId,
      mensagemOrigemId,
      contatoId,
      titulo: texto.substring(0, 100),
      descricao: texto,
      subcategoriaId: classificacao.subcategoria_id,
      macroCategoriaId: classificacao.macro_categoria_id,
      prioridade: prioridade || 'normal',
      classificacaoAutomatica: true,
      confidenceScore: classificacao.confidence
    });

    return res.status(201).json({
      success: true,
      data: {
        solicitacao,
        classificacao: {
          subcategoria: classificacao.subcategoria_nome,
          macro_categoria: classificacao.macro_categoria_nome,
          confidence: classificacao.confidence,
          matchedKeywords: classificacao.matchedKeywords,
          alternativas: classificacao.alternativas
        }
      }
    });
  } catch (error) {
    logger.error('Erro ao criar solicitação com auto-classificação', { error: error.message });
    return next(error);
  }
}

/**
 * Classifica uma mensagem (sem criar solicitação)
 * POST /api/solicitacoes/classificar
 */
async function classificarMensagem(req, res, next) {
  try {
    const { texto, contexto } = req.body;

    const classificacao = await solicitacaoService.classificarMensagemComIA(texto, contexto);

    return res.json({
      success: true,
      data: classificacao
    });
  } catch (error) {
    logger.error('Erro ao classificar mensagem', { error: error.message });
    return next(error);
  }
}

/**
 * Lista solicitações com filtros
 * GET /api/solicitacoes
 */
async function listarSolicitacoes(req, res, next) {
  try {
    const {
      status,
      prioridade,
      macroCategoriaId,
      subcategoriaId,
      responsavelId,
      contatoId,
      slaStatus,
      limit,
      offset
    } = req.query;

    const resultado = await solicitacaoService.listarSolicitacoes({
      status,
      prioridade,
      macroCategoriaId: macroCategoriaId ? parseInt(macroCategoriaId) : null,
      subcategoriaId: subcategoriaId ? parseInt(subcategoriaId) : null,
      responsavelId: responsavelId ? parseInt(responsavelId) : null,
      contatoId: contatoId ? parseInt(contatoId) : null,
      slaStatus,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0
    });

    return res.json({
      success: true,
      data: resultado.solicitacoes,
      pagination: {
        total: resultado.total,
        limit: resultado.limit,
        offset: resultado.offset,
        hasMore: resultado.offset + resultado.limit < resultado.total
      }
    });
  } catch (error) {
    logger.error('Erro ao listar solicitações', { error: error.message });
    return next(error);
  }
}

/**
 * Busca solicitação por ID
 * GET /api/solicitacoes/:id
 */
async function buscarSolicitacao(req, res, next) {
  try {
    const { id } = req.params;

    const solicitacao = await solicitacaoService.buscarSolicitacaoCompleta(parseInt(id));

    return res.json({
      success: true,
      data: solicitacao
    });
  } catch (error) {
    logger.error('Erro ao buscar solicitação', { error: error.message });
    return next(error);
  }
}

/**
 * Atualiza status de solicitação
 * PATCH /api/solicitacoes/:id/status
 */
async function atualizarStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, observacao } = req.body;
    const usuarioId = req.user?.id || null; // assumindo auth middleware

    const solicitacao = await solicitacaoService.atualizarStatusSolicitacao(
      parseInt(id),
      status,
      usuarioId,
      observacao
    );

    return res.json({
      success: true,
      data: solicitacao
    });
  } catch (error) {
    logger.error('Erro ao atualizar status', { error: error.message });
    return next(error);
  }
}

/**
 * Atribui solicitação a usuário
 * PATCH /api/solicitacoes/:id/atribuir
 */
async function atribuirSolicitacao(req, res, next) {
  try {
    const { id } = req.params;
    const { usuarioId } = req.body;

    const solicitacao = await solicitacaoService.atribuirSolicitacao(
      parseInt(id),
      parseInt(usuarioId)
    );

    return res.json({
      success: true,
      data: solicitacao
    });
  } catch (error) {
    logger.error('Erro ao atribuir solicitação', { error: error.message });
    return next(error);
  }
}

/**
 * Reclassifica solicitação
 * PATCH /api/solicitacoes/:id/reclassificar
 */
async function reclassificar(req, res, next) {
  try {
    const { id } = req.params;
    const { subcategoriaId } = req.body;
    const usuarioId = req.user?.id || null;

    const solicitacao = await solicitacaoService.reclassificarSolicitacao(
      parseInt(id),
      parseInt(subcategoriaId),
      usuarioId
    );

    return res.json({
      success: true,
      data: solicitacao
    });
  } catch (error) {
    logger.error('Erro ao reclassificar solicitação', { error: error.message });
    return next(error);
  }
}

/**
 * Busca solicitações com SLA em risco
 * GET /api/solicitacoes/sla/em-risco
 */
async function buscarSLAEmRisco(req, res, next) {
  try {
    const solicitacoes = await solicitacaoService.buscarSolicitacoesEmRisco();

    return res.json({
      success: true,
      data: solicitacoes,
      count: solicitacoes.length
    });
  } catch (error) {
    logger.error('Erro ao buscar SLA em risco', { error: error.message });
    return next(error);
  }
}

/**
 * Dashboard - estatísticas gerais
 * GET /api/solicitacoes/dashboard/stats
 */
async function getDashboardStats(req, res, next) {
  try {
    const pool = require('../../infrastructure/database/postgres');

    const [abertas, emAndamento, aguardandoCliente, resolvidas, slaVencido, slaProximoVenc] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM solicitacoes WHERE status = 'aberta'"),
      pool.query("SELECT COUNT(*) FROM solicitacoes WHERE status = 'em_andamento'"),
      pool.query("SELECT COUNT(*) FROM solicitacoes WHERE status = 'aguardando_cliente'"),
      pool.query("SELECT COUNT(*) FROM solicitacoes WHERE status IN ('resolvida', 'fechada')"),
      pool.query("SELECT COUNT(*) FROM solicitacoes WHERE status IN ('aberta', 'em_andamento') AND sla_status = 'vencido'"),
      pool.query("SELECT COUNT(*) FROM solicitacoes WHERE status IN ('aberta', 'em_andamento') AND sla_status = 'proximo_vencimento'")
    ]);

    // Tempo médio de resolução
    const tempoMedioResult = await pool.query(
      "SELECT AVG(tempo_resolucao_minutos) as tempo_medio FROM solicitacoes WHERE tempo_resolucao_minutos IS NOT NULL"
    );

    // Distribuição por categoria
    const distribuicaoResult = await pool.query(`
      SELECT
        mc.nome as categoria,
        COUNT(s.id) as quantidade
      FROM solicitacoes s
      JOIN macro_categorias mc ON s.macro_categoria_id = mc.id
      WHERE s.created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY mc.nome
      ORDER BY quantidade DESC
    `);

    return res.json({
      success: true,
      data: {
        totais: {
          abertas: parseInt(abertas.rows[0].count),
          em_andamento: parseInt(emAndamento.rows[0].count),
          aguardando_cliente: parseInt(aguardandoCliente.rows[0].count),
          resolvidas: parseInt(resolvidas.rows[0].count)
        },
        sla: {
          vencido: parseInt(slaVencido.rows[0].count),
          proximo_vencimento: parseInt(slaProximoVenc.rows[0].count)
        },
        metricas: {
          tempo_medio_resolucao_horas: tempoMedioResult.rows[0].tempo_medio
            ? Math.round(tempoMedioResult.rows[0].tempo_medio / 60 * 10) / 10
            : 0
        },
        distribuicao_categorias: distribuicaoResult.rows
      }
    });
  } catch (error) {
    logger.error('Erro ao buscar stats do dashboard', { error: error.message });
    return next(error);
  }
}

module.exports = {
  criarSolicitacao,
  criarComClassificacaoAutomatica,
  classificarMensagem,
  listarSolicitacoes,
  buscarSolicitacao,
  atualizarStatus,
  atribuirSolicitacao,
  reclassificar,
  buscarSLAEmRisco,
  getDashboardStats
};
