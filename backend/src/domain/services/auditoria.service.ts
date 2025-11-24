// domain/services/auditoria.service.ts
const auditoriaRepository = require('../repositories/auditoria.repository.ts');
const logger = require('../../shared/config/logger.config');
const {
  ValidationError,
  NotFoundError,
  ForbiddenError
} = require('../../shared/errors/AppError');

const clampPageSize = (value, fallback = 20, max = 100) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
};

const parsePage = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 1;
  }
  return parsed;
};

const ensureAuditorRole = (user) => {
  if (!user || !['auditor', 'admin'].includes(user.role)) {
    throw new ForbiddenError('Permissão negada para auditoria');
  }
};

const normalizePagination = ({ page, pageSize }, options = {}) => {
  const defaultPageSize = options.defaultPageSize || 20;
  const maxPageSize = options.maxPageSize || 100;
  const safePageSize = clampPageSize(
    pageSize ?? defaultPageSize,
    defaultPageSize,
    maxPageSize
  );
  const safePage = parsePage(page);
  return {
    page: safePage,
    pageSize: safePageSize,
    limit: safePageSize,
    offset: (safePage - 1) * safePageSize
  };
};

const mapRecentConversation = (item) => ({
  conversa: item.conversa,
  periodoInicio: item.periodoInicio,
  ultimaMensagem: item.ultimaMensagem,
  novasNoPeriodo: item.novasNoPeriodo
});

const mapAuditoria = (auditoria) => {
  if (!auditoria) return null;

  return {
    id: auditoria.id,
    conversaId: auditoria.conversaId,
    conversa: auditoria.conversa,
    dataInicio: auditoria.dataInicio,
    dataFim: auditoria.dataFim,
    usuarioId: auditoria.usuarioId,
    usuario: auditoria.usuario,
    qtdMensagens: auditoria.qtdMensagens,
    observacao: auditoria.observacao,
    status: auditoria.status,
    metadata: auditoria.metadata || {},
    createdAt: auditoria.createdAt,
    updatedAt: auditoria.updatedAt
  };
};

const getRecentConversations = async ({ page, pageSize }) => {
  const pagination = normalizePagination({ page, pageSize });

  const result = await auditoriaRepository.listRecentConversations({
    limit: pagination.limit,
    offset: pagination.offset
  });

  return {
    items: result.items.map(mapRecentConversation),
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: result.total
    }
  };
};

const getNonAuditedConversations = async ({ page, pageSize, tipo }) => {
  const pagination = normalizePagination({ page, pageSize });

  const result = await auditoriaRepository.listNonAuditedConversations({
    limit: pagination.limit,
    offset: pagination.offset,
    tipo: tipo || undefined
  });

  return {
    items: result.items.map(mapRecentConversation),
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: result.total
    }
  };
};

const getOpenPeriod = async (conversaId) => {
  const now = new Date();
  const periodo = await auditoriaRepository.getConversationPeriod(conversaId, now);

  return {
    conversa: periodo.conversa,
    periodoInicio: periodo.periodoInicio,
    periodoFimPreview: periodo.periodoFimPreview,
    totalMensagens: periodo.totalMensagens,
    auditoriaReabertaId: periodo.auditoriaReabertaId ?? null,
    auditoriaReabertaInicio: periodo.auditoriaReabertaInicio ?? null,
    auditoriaReabertaFim: periodo.auditoriaReabertaFim ?? null
  };
};

const getMessagesForPeriod = async (conversaId, { from, to, page, pageSize }) => {
  const periodoInfo = await getOpenPeriod(conversaId);

  const periodoInicio = from ? new Date(from) : new Date(periodoInfo.periodoInicio);
  const periodoFim = to ? new Date(to) : new Date();

  if (Number.isNaN(periodoInicio.getTime()) || Number.isNaN(periodoFim.getTime())) {
    throw new ValidationError('Intervalo de mensagens inválido');
  }

  if (periodoFim <= periodoInicio) {
    throw new ValidationError('Período informado é inválido (fim <= início)');
  }

  const pagination = normalizePagination(
    { page, pageSize: pageSize || 100 },
    { defaultPageSize: 100, maxPageSize: 500 }
  );

  const resultado = await auditoriaRepository.listPeriodMessages(
    conversaId,
    periodoInicio,
    periodoFim,
    { limit: pagination.limit, offset: pagination.offset }
  );

  return {
    conversa: periodoInfo.conversa,
    periodoInicio,
    periodoFim,
    totalMensagens: resultado.total,
    items: resultado.items,
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: resultado.total
    }
  };
};

const validateConclusaoPayload = (payload) => {
  if (!payload) {
    throw new ValidationError('Dados obrigatórios não informados');
  }

  const {
    conversa_id: conversaId,
    data_inicio: dataInicio,
    data_fim: dataFim,
    usuario_id: usuarioId,
    qtd_mensagens: qtdMensagens
  } = payload;

  if (!Number.isInteger(conversaId) || conversaId <= 0) {
    throw new ValidationError('Conversa inválida para auditoria');
  }

  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    throw new ValidationError('Usuário inválido para auditoria');
  }

  const parsedInicio = new Date(dataInicio);
  if (!dataInicio || Number.isNaN(parsedInicio.getTime())) {
    throw new ValidationError('Data de início da auditoria inválida');
  }

  const parsedFim = new Date(dataFim);
  if (!dataFim || Number.isNaN(parsedFim.getTime())) {
    throw new ValidationError('Data de fim da auditoria inválida');
  }

  if (!Number.isInteger(qtdMensagens) || qtdMensagens <= 0) {
    throw new ValidationError('Quantidade de mensagens auditadas deve ser maior que zero');
  }

  return {
    conversaId,
    usuarioId,
    dataInicio: parsedInicio,
    dataFim: parsedFim,
    qtdMensagens,
    observacao: typeof payload.observacao === 'string' ? payload.observacao.trim() || null : null,
    metadata: typeof payload.metadata === 'object' && payload.metadata !== null ? payload.metadata : {}
  };
};

const concludeAuditoria = async (payload, contexto) => {
  const {
    conversaId,
    usuarioId,
    dataInicio,
    dataFim,
    qtdMensagens,
    observacao,
    metadata
  } = validateConclusaoPayload(payload);

  const { user, requestIp, userAgent } = contexto;

  ensureAuditorRole(user);

  if (usuarioId !== user.id) {
    throw new ValidationError('Usuário da auditoria deve corresponder ao usuário autenticado');
  }

  const periodoAtual = await auditoriaRepository.getConversationPeriod(conversaId, dataFim);

  const periodoInicioOficial = new Date(periodoAtual.periodoInicio);
  const periodoFimOficial = new Date(dataFim);

  if (periodoAtual.totalMensagens <= 0) {
    throw new ValidationError('Não há mensagens novas para auditar neste período');
  }

  const deltaInicio = Math.abs(periodoInicioOficial.getTime() - dataInicio.getTime());
  if (deltaInicio > 60 * 1000) {
    throw new ValidationError('Período de início divergente do intervalo oficial');
  }

  if (qtdMensagens !== periodoAtual.totalMensagens) {
    throw new ValidationError(
      `Quantidade de mensagens informada (${qtdMensagens}) difere do total encontrado (${periodoAtual.totalMensagens})`
    );
  }

  const metadataFinal = {
    ...metadata,
    ip: requestIp || null,
    user_agent: userAgent || null,
    periodo_validado_em: new Date().toISOString()
  };

  const auditoriaId = await auditoriaRepository.insertAuditoria({
    conversaId,
    dataInicio: periodoInicioOficial,
    dataFim: periodoFimOficial,
    usuarioId,
    qtdMensagens,
    observacao,
    status: 'concluida',
    metadata: metadataFinal
  });

  const auditoria = await auditoriaRepository.getAuditoriaById(auditoriaId);

  logger.info('Auditoria concluída', {
    auditoriaId,
    conversaId,
    usuarioId,
    qtdMensagens
  });

  return mapAuditoria(auditoria);
};

const parseHistoricoFilters = (filters = {}) => {
  const parsed = {
    status: filters.status,
    usuarioId: filters.usuarioId ? Number(filters.usuarioId) : undefined,
    conversaId: filters.conversaId ? Number(filters.conversaId) : undefined,
    tipoConversa: filters.tipoConversa,
    dtStart: filters.dtStart ? new Date(filters.dtStart) : undefined,
    dtEnd: filters.dtEnd ? new Date(filters.dtEnd) : undefined,
    qtdMin: filters.qtdMin ? Number(filters.qtdMin) : undefined,
    hasObs: typeof filters.hasObs === 'boolean' ? filters.hasObs : undefined,
    nomeConversa: filters.nomeConversa
  };

  if (parsed.dtStart && Number.isNaN(parsed.dtStart.getTime())) {
    throw new ValidationError('Filtro de data inicial inválido');
  }

  if (parsed.dtEnd && Number.isNaN(parsed.dtEnd.getTime())) {
    throw new ValidationError('Filtro de data final inválido');
  }

  if (parsed.dtStart && parsed.dtEnd && parsed.dtEnd < parsed.dtStart) {
    throw new ValidationError('Período de filtros inválido (fim < início)');
  }

  return parsed;
};

const getHistorico = async ({ filters, page, pageSize }) => {
  const parsedFilters = parseHistoricoFilters(filters);

  const pagination = normalizePagination(
    { page, pageSize },
    { defaultPageSize: 20, maxPageSize: 200 }
  );

  const historico = await auditoriaRepository.listAuditoriaHistory(
    parsedFilters,
    { limit: pagination.limit, offset: pagination.offset }
  );

  return {
    items: historico.items.map(mapAuditoria),
    summary: historico.summary,
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: historico.total
    }
  };
};

const getAuditoriaDetalhes = async (auditoriaId) => {
  if (!Number.isInteger(auditoriaId) || auditoriaId <= 0) {
    throw new ValidationError('Auditoria inválida');
  }

  const result = await auditoriaRepository.getAuditoriaMessages(auditoriaId);
  if (!result || !result.auditoria) {
    throw new NotFoundError('Auditoria não encontrada');
  }

  return {
    auditoria: mapAuditoria(result.auditoria),
    mensagens: result.mensagens
  };
};

const reabrirAuditoria = async ({ auditoriaId, usuario }) => {
  ensureAuditorRole(usuario);

  if (!Number.isInteger(auditoriaId) || auditoriaId <= 0) {
    throw new ValidationError('Auditoria inválida para reabertura');
  }

  const novaAuditoriaId = await auditoriaRepository.createReauditoria({
    auditoriaId,
    usuarioId: usuario.id,
    metadata: {}
  });

  const novaAuditoria = await auditoriaRepository.getAuditoriaById(novaAuditoriaId);

  return mapAuditoria(novaAuditoria);
};

const exportarHistoricoCsv = async (params) => {
  const parsedFilters = parseHistoricoFilters(params.filters);

  const historico = await auditoriaRepository.listAuditoriaHistory(
    parsedFilters,
    { limit: params.limit || 10000, offset: 0 }
  );

  const headers = [
    'auditoria_id',
    'conversa_id',
    'conversa_nome',
    'tipo_conversa',
    'data_inicio',
    'data_fim',
    'usuario_id',
    'usuario_nome',
    'status',
    'qtd_mensagens',
    'observacao',
    'metadata'
  ];

  const lines = historico.items.map((item) => {
    const metadataStr = JSON.stringify(item.metadata || {});
    const observacaoClean = (item.observacao || '').replace(/"/g, '""');
    const metadataClean = metadataStr.replace(/"/g, '""');

    return [
      item.id,
      item.conversaId,
      item.conversa?.nome || '',
      item.conversa?.tipo || '',
      item.dataInicio ? new Date(item.dataInicio).toISOString() : '',
      item.dataFim ? new Date(item.dataFim).toISOString() : '',
      item.usuarioId,
      item.usuario?.nome || '',
      item.status,
      item.qtdMensagens,
      `"${observacaoClean}"`,
      `"${metadataClean}"`
    ].join(',');
  });

  return [headers.join(','), ...lines].join('\n');
};

module.exports = {
  getRecentConversations,
  getNonAuditedConversations,
  getOpenPeriod,
  getMessagesForPeriod,
  concludeAuditoria,
  getHistorico,
  getAuditoriaDetalhes,
  reabrirAuditoria,
  exportarHistoricoCsv
};
