// api/routes/solicitacao.routes.js
const express = require('express');
const router = express.Router();
const solicitacaoController = require('../controllers/solicitacao.controller');
// const authMiddleware = require('../middlewares/auth.middleware'); // descomentar quando tiver auth

/**
 * @route   POST /api/solicitacoes
 * @desc    Cria nova solicitação manualmente
 * @access  Private
 */
router.post('/', solicitacaoController.criarSolicitacao);

/**
 * @route   POST /api/solicitacoes/auto-classificar
 * @desc    Cria solicitação com classificação automática pela IA
 * @access  Private
 */
router.post('/auto-classificar', solicitacaoController.criarComClassificacaoAutomatica);

/**
 * @route   POST /api/solicitacoes/classificar
 * @desc    Classifica uma mensagem sem criar solicitação
 * @access  Private
 */
router.post('/classificar', solicitacaoController.classificarMensagem);

/**
 * @route   GET /api/solicitacoes/sla/em-risco
 * @desc    Busca solicitações com SLA em risco
 * @access  Private
 * @note    Esta rota precisa vir ANTES de /:id para não capturar "sla" como ID
 */
router.get('/sla/em-risco', solicitacaoController.buscarSLAEmRisco);

/**
 * @route   GET /api/solicitacoes/dashboard/stats
 * @desc    Estatísticas do dashboard
 * @access  Private
 */
router.get('/dashboard/stats', solicitacaoController.getDashboardStats);

/**
 * @route   GET /api/solicitacoes
 * @desc    Lista solicitações com filtros
 * @access  Private
 * @query   status, prioridade, macroCategoriaId, subcategoriaId, responsavelId, contatoId, slaStatus, limit, offset
 */
router.get('/', solicitacaoController.listarSolicitacoes);

/**
 * @route   GET /api/solicitacoes/:id
 * @desc    Busca solicitação por ID
 * @access  Private
 */
router.get('/:id', solicitacaoController.buscarSolicitacao);

/**
 * @route   PATCH /api/solicitacoes/:id/status
 * @desc    Atualiza status da solicitação
 * @access  Private
 */
router.patch('/:id/status', solicitacaoController.atualizarStatus);

/**
 * @route   PATCH /api/solicitacoes/:id/atribuir
 * @desc    Atribui solicitação a um usuário
 * @access  Private
 */
router.patch('/:id/atribuir', solicitacaoController.atribuirSolicitacao);

/**
 * @route   PATCH /api/solicitacoes/:id/reclassificar
 * @desc    Reclassifica uma solicitação
 * @access  Private
 */
router.patch('/:id/reclassificar', solicitacaoController.reclassificar);

module.exports = router;
