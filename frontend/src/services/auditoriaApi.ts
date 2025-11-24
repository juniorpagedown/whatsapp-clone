import { buildApiUrl } from '../utils/api';

export type ConversationInfo = {
  id: number;
  chatId?: string | null;
  tipo?: string | null;
  nome?: string | null;
  grupoId?: number | null;
  contatoId?: number | null;
  ultimaMensagem?: string | null;
  ultimaMensagemTimestamp?: string | null;
};

export type RecentConversation = {
  conversa: ConversationInfo;
  periodoInicio: string;
  ultimaMensagem?: string | null;
  novasNoPeriodo: number;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
};

export type RecentConversationsResponse = {
  items: RecentConversation[];
  pagination: Pagination;
};

export type AuditPeriod = {
  conversa: ConversationInfo | null;
  periodoInicio: string;
  periodoFimPreview: string;
  totalMensagens: number;
  auditoriaReabertaId?: number | null;
  auditoriaReabertaInicio?: string | null;
  auditoriaReabertaFim?: string | null;
};

export type AuditMessageClassification = {
  id: number;
  macro: string;
  item?: string | null;
  comentario?: string | null;
  criado_por?: number | null;
  created_at?: string | null;
};

export type AuditMessage = {
  id: number;
  messageId?: string | null;
  conversaId: number;
  contatoId?: number | null;
  senderName?: string | null;
  senderPhone?: string | null;
  tipoMensagem: string;
  texto?: string | null;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  caption?: string | null;
  isFromMe: boolean;
  timestamp: string;
  status?: string | null;
  metadata?: Record<string, unknown>;
  classificacoes: AuditMessageClassification[];
};

export type AuditMessagesResponse = {
  conversa: ConversationInfo | null;
  periodoInicio: string;
  periodoFim: string;
  totalMensagens: number;
  items: AuditMessage[];
  pagination: Pagination;
};

export type AuditUserInfo = {
  id: number;
  nome?: string | null;
  email?: string | null;
};

export type AuditHistoryItem = {
  id: number;
  conversaId: number;
  conversa?: ConversationInfo | null;
  dataInicio: string;
  dataFim: string;
  usuarioId: number;
  usuario?: AuditUserInfo | null;
  qtdMensagens: number;
  observacao?: string | null;
  status: 'concluida' | 'reaberta' | 'cancelada';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AuditHistorySummary = {
  total: number;
  concluidas: number;
  reabertas: number;
  canceladas: number;
};

export type AuditHistoryResponse = {
  items: AuditHistoryItem[];
  pagination: Pagination;
  summary: AuditHistorySummary;
};

export type AuditDetailResponse = {
  auditoria: AuditHistoryItem | null;
  mensagens: AuditMessage[];
};

export type AuditHistoryFilters = {
  status?: string;
  usuarioId?: number;
  conversaId?: number;
  tipoConversa?: string;
  dtStart?: string;
  dtEnd?: string;
  qtdMin?: number;
  hasObs?: boolean;
  nomeConversa?: string;
  page?: number;
  pageSize?: number;
};

export type ConcludeAuditPayload = {
  conversa_id: number;
  data_inicio: string;
  data_fim: string;
  usuario_id: number;
  qtd_mensagens: number;
  observacao?: string | null;
  metadata?: Record<string, unknown>;
};

const BASE_URL = buildApiUrl('/api/auditoria');

const getHeaders = (isJson = true) => {
  const token = typeof window !== 'undefined'
    ? window.localStorage.getItem('token')
    : null;

  const headers: Record<string, string> = {};

  if (isJson) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

const parseJsonResponse = async <T>(response: Response): Promise<T> => {
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const message = payload?.error?.message || `Erro na requisição (${response.status})`;
    throw new Error(message);
  }

  return payload?.data as T;
};

export const fetchRecentConversations = async (page = 1, pageSize = 20): Promise<RecentConversationsResponse> => {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize)
  });

  const response = await fetch(`${BASE_URL}/conversas-recentes?${params.toString()}`, {
    method: 'GET',
    headers: getHeaders(false)
  });

  const payload = await response.json();

  if (!response.ok) {
    const message = payload?.error?.message || `Erro na requisição (${response.status})`;
    throw new Error(message);
  }

  return {
    items: Array.isArray(payload?.data) ? payload.data : [],
    pagination: payload?.pagination || {
      page,
      pageSize,
      total: 0
    }
  };
};

export const fetchNonAuditedConversations = async (
  page = 1,
  pageSize = 20,
  tipo?: string
): Promise<RecentConversationsResponse> => {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize)
  });

  if (tipo) {
    params.set('tipo', tipo);
  }

  const response = await fetch(`${BASE_URL}/conversas-nao-auditadas?${params.toString()}`, {
    method: 'GET',
    headers: getHeaders(false)
  });

  const payload = await response.json();

  if (!response.ok) {
    const message = payload?.error?.message || `Erro na requisição (${response.status})`;
    throw new Error(message);
  }

  return {
    items: Array.isArray(payload?.data) ? payload.data : [],
    pagination: payload?.pagination || {
      page,
      pageSize,
      total: 0
    }
  };
};

export const fetchOpenPeriod = async (conversaId: number): Promise<AuditPeriod> => {
  const response = await fetch(`${BASE_URL}/conversa/${conversaId}/periodo`, {
    method: 'GET',
    headers: getHeaders(false)
  });

  return parseJsonResponse<AuditPeriod>(response);
};

export type FetchMessagesParams = {
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export const fetchPeriodMessages = async (
  conversaId: number,
  params: FetchMessagesParams = {}
): Promise<AuditMessagesResponse> => {
  const search = new URLSearchParams();

  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  if (typeof params.page === 'number') search.set('page', String(params.page));
  if (typeof params.pageSize === 'number') search.set('pageSize', String(params.pageSize));

  const url = search.toString()
    ? `${BASE_URL}/conversa/${conversaId}/mensagens?${search.toString()}`
    : `${BASE_URL}/conversa/${conversaId}/mensagens`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(false)
  });

  return parseJsonResponse<AuditMessagesResponse>(response);
};

export const concludeAudit = async (payload: ConcludeAuditPayload) => {
  const response = await fetch(`${BASE_URL}/concluir`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });

  return parseJsonResponse<AuditHistoryItem>(response);
};

const buildHistoryParams = (filters: AuditHistoryFilters = {}) => {
  const params = new URLSearchParams();

  if (filters.status) params.set('status', filters.status);
  if (typeof filters.usuarioId === 'number') params.set('usuario_id', String(filters.usuarioId));
  if (typeof filters.conversaId === 'number') params.set('conversa_id', String(filters.conversaId));
  if (filters.tipoConversa) params.set('tipo_conversa', filters.tipoConversa);
  if (filters.dtStart) params.set('dt_start', filters.dtStart);
  if (filters.dtEnd) params.set('dt_end', filters.dtEnd);
  if (typeof filters.qtdMin === 'number') params.set('qtd_min', String(filters.qtdMin));
  if (typeof filters.hasObs === 'boolean') params.set('has_obs', filters.hasObs ? 'true' : 'false');
  if (filters.nomeConversa) params.set('conversa_nome', filters.nomeConversa);
  if (typeof filters.page === 'number') params.set('page', String(filters.page));
  if (typeof filters.pageSize === 'number') params.set('pageSize', String(filters.pageSize));

  return params;
};

export const fetchAuditHistory = async (filters: AuditHistoryFilters = {}): Promise<AuditHistoryResponse> => {
  const params = buildHistoryParams(filters);
  const query = params.toString();

  const response = await fetch(query ? `${BASE_URL}/historico?${query}` : `${BASE_URL}/historico`, {
    method: 'GET',
    headers: getHeaders(false)
  });

  const payload = await response.json();

  if (!response.ok) {
    const message = payload?.error?.message || `Erro na requisição (${response.status})`;
    throw new Error(message);
  }

  return {
    items: Array.isArray(payload?.data) ? payload.data : [],
    pagination: payload?.pagination || {
      page: filters.page || 1,
      pageSize: filters.pageSize || 20,
      total: 0
    },
    summary: payload?.summary || {
      total: 0,
      concluidas: 0,
      reabertas: 0,
      canceladas: 0
    }
  };
};

export const fetchAuditDetails = async (auditoriaId: number): Promise<AuditDetailResponse> => {
  const response = await fetch(`${BASE_URL}/${auditoriaId}/detalhes`, {
    method: 'GET',
    headers: getHeaders(false)
  });

  return parseJsonResponse<AuditDetailResponse>(response);
};

export const reopenAudit = async (auditoriaId: number): Promise<AuditHistoryItem> => {
  const response = await fetch(`${BASE_URL}/${auditoriaId}/reabrir`, {
    method: 'POST',
    headers: getHeaders()
  });

  return parseJsonResponse<AuditHistoryItem>(response);
};

export const exportAuditHistory = async (filters: AuditHistoryFilters = {}): Promise<string> => {
  const params = buildHistoryParams(filters);
  const query = params.toString();

  const response = await fetch(query ? `${BASE_URL}/export?${query}` : `${BASE_URL}/export`, {
    method: 'GET',
    headers: getHeaders(false)
  });

  if (!response.ok) {
    const text = await response.text();
    const message = text || `Erro na exportação (${response.status})`;
    throw new Error(message);
  }

  return await response.text();
};
