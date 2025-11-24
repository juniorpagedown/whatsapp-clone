// api/controllers/auditoria.controller.ts
const auditoriaService = require('../../domain/services/auditoria.service.ts');
const logger = require('../../shared/config/logger.config');

const listRecentConversations = async (req, res) => {
  const { page, pageSize } = req.query || {};

  const result = await auditoriaService.getRecentConversations({
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined
  });

  res.status(200).json({
    data: result.items,
    pagination: result.pagination
  });
};

const listNonAuditedConversations = async (req, res) => {
  const { page, pageSize, tipo } = req.query || {};

  const result = await auditoriaService.getNonAuditedConversations({
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
    tipo: typeof tipo === 'string' && tipo.trim().length > 0 ? tipo.trim() : undefined
  });

  res.status(200).json({
    data: result.items,
    pagination: result.pagination
  });
};

const getConversationPeriod = async (req, res) => {
  const conversaId = Number(req.params?.conversaId);
  const periodo = await auditoriaService.getOpenPeriod(conversaId);

  logger.info('Período de auditoria calculado', {
    conversaId,
    totalMensagens: periodo.totalMensagens
  });

  res.status(200).json({ data: periodo });
};

const getConversationMessages = async (req, res) => {
  const conversaId = Number(req.params?.conversaId);
  const { from, to, page, pageSize } = req.query || {};

  const mensagens = await auditoriaService.getMessagesForPeriod(conversaId, {
    from,
    to,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined
  });

  logger.info('Mensagens de auditoria consultadas', {
    conversaId,
    page: page ? Number(page) : 1,
    pageSize: pageSize ? Number(pageSize) : undefined
  });

  res.status(200).json({ data: mensagens });
};

const concludeAuditoria = async (req, res) => {
  const auditoria = await auditoriaService.concludeAuditoria(req.body, {
    user: req.user,
    requestIp: req.ip,
    userAgent: req.get('user-agent') || null
  });

  res.status(200).json({ data: auditoria });
};

const getHistorico = async (req, res) => {
  const {
    page,
    pageSize,
    dt_start: dtStart,
    dt_end: dtEnd,
    usuario_id: usuarioId,
    conversa_id: conversaId,
    tipo_conversa: tipoConversa,
    status,
    qtd_min: qtdMin,
    has_obs: hasObs,
    conversa_nome: nomeConversa
  } = req.query || {};

  const filters = {
    status,
    usuarioId: usuarioId ? Number(usuarioId) : undefined,
    conversaId: conversaId ? Number(conversaId) : undefined,
    tipoConversa,
    dtStart,
    dtEnd,
    qtdMin: qtdMin ? Number(qtdMin) : undefined,
    hasObs: typeof hasObs === 'string'
      ? (hasObs.toLowerCase() === 'true'
        ? true
        : hasObs.toLowerCase() === 'false'
          ? false
          : undefined)
      : undefined,
    nomeConversa: nomeConversa || undefined
  };

  const historico = await auditoriaService.getHistorico({
    filters,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined
  });

  res.status(200).json({
    data: historico.items,
    pagination: historico.pagination,
    summary: historico.summary
  });
};

const getAuditoriaDetalhes = async (req, res) => {
  const auditoriaId = Number(req.params?.auditoriaId);
  const detalhes = await auditoriaService.getAuditoriaDetalhes(auditoriaId);

  logger.info('Detalhes de auditoria acessados', {
    auditoriaId,
    conversaId: detalhes?.auditoria?.conversaId
  });

  res.status(200).json({ data: detalhes });
};

const reabrirAuditoria = async (req, res) => {
  const auditoriaId = Number(req.params?.auditoriaId);
  const auditoria = await auditoriaService.reabrirAuditoria({
    auditoriaId,
    usuario: req.user
  });

  logger.info('Auditoria reaberta via API', {
    auditoriaOriginal: auditoriaId,
    auditoriaReaberta: auditoria?.id,
    usuarioId: req.user?.id
  });

  res.status(200).json({ data: auditoria });
};

const exportHistorico = async (req, res) => {
  const csv = await auditoriaService.exportarHistoricoCsv({
    filters: {
      status: req.query?.status,
      usuarioId: req.query?.usuario_id ? Number(req.query.usuario_id) : undefined,
      conversaId: req.query?.conversa_id ? Number(req.query.conversa_id) : undefined,
      tipoConversa: req.query?.tipo_conversa,
      dtStart: req.query?.dt_start,
      dtEnd: req.query?.dt_end,
      qtdMin: req.query?.qtd_min ? Number(req.query.qtd_min) : undefined,
      hasObs: typeof req.query?.has_obs === 'string'
        ? (req.query.has_obs.toLowerCase() === 'true'
          ? true
          : req.query.has_obs.toLowerCase() === 'false'
            ? false
            : undefined)
        : undefined,
      nomeConversa: req.query?.conversa_nome || undefined
    }
  });

  logger.info('Exportação de auditorias solicitada', {
    usuarioId: req.user?.id,
    filtros: req.query
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="auditorias.csv"');
  res.status(200).send(csv);
};

module.exports = {
  listRecentConversations,
  listNonAuditedConversations,
  getConversationPeriod,
  getConversationMessages,
  concludeAuditoria,
  getHistorico,
  getAuditoriaDetalhes,
  reabrirAuditoria,
  exportHistorico
};
