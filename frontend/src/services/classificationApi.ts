import { buildApiUrl } from '../utils/api';

export type ClassificationSuggestion = {
  macro: string;
  item: string;
  score: number;
};

export type ClassificationRecord = {
  id: number;
  conversaId: number;
  macro: string;
  item: string;
  origem: string;
  confianca: number | null;
  criadoPor: string | null;
  criadoEm: string;
};

export type ClassificationSnapshot = {
  macro: string | null;
  item: string | null;
  classificadoPor: string | null;
  classificadoEm: string | null;
};

export type ClassificationCatalog = {
  macros: string[];
  itens: Record<string, string[]>;
};

export type MessageClassificationRecord = {
  id: number;
  messageId: number;
  conversaId: number;
  userId: number;
  macro: string;
  item: string;
  comentario: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClassificacaoCatalogoItem = {
  id: number;
  macro: string;
  item: string;
  slug: string;
  descricao: string | null;
  cor_hex: string | null;
  prioridade: number;
  ativo: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ListClassificacoesResponse = {
  data: ClassificacaoCatalogoItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ListClassificacoesParams = {
  q?: string;
  ativo?: 'true' | 'false' | 'all' | 'deleted';
  page?: number;
  pageSize?: number;
  sort?: string;
};

export type ClassificacaoPayload = {
  macro: string;
  item: string;
  descricao?: string | null;
  cor_hex?: string | null;
  prioridade?: number;
  ativo?: boolean;
};

export type UpdateClassificacaoPayload = Partial<ClassificacaoPayload>;

export type ImportClassificacaoReportLine = {
  line: number | null;
  status: 'created' | 'updated' | 'error';
  slug?: string;
  error?: string;
};

type BuildHeadersOptions = {
  contentType?: string | null;
};

const buildHeaders = (options: BuildHeadersOptions = {}) => {
  const headers: Record<string, string> = {};

  const contentType = options.contentType === undefined ? 'application/json' : options.contentType;
  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('token') : null;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

const parseJson = async (response: Response) => {
  const contentType = response.headers.get('content-type');
  const isJson = contentType?.includes('application/json');
  return isJson ? response.json() : null;
};

const ensureOk = async (response: Response) => {
  if (response.ok) {
    return response;
  }

  const payload = await parseJson(response);
  const message = payload?.error?.message || `Erro na requisição (${response.status})`;
  throw new Error(message);
};

export const fetchCatalog = async (): Promise<ClassificationCatalog> => {
  const response = await fetch(buildApiUrl('/api/catalogo/classificacao'), {
    method: 'GET',
    headers: buildHeaders()
  });

  const payload = await ensureOk(response).then(parseJson);
  const macros = Array.isArray(payload?.macros) ? payload.macros : [];
  const itens = payload?.itens && typeof payload.itens === 'object' ? payload.itens : {};
  return { macros, itens };
};

export const fetchSuggestions = async (conversaId: number): Promise<ClassificationSuggestion[]> => {
  const response = await fetch(buildApiUrl(`/api/conversas/${conversaId}/sugestoes`), {
    method: 'GET',
    headers: buildHeaders()
  });

  const payload = await ensureOk(response).then(parseJson);
  const suggestions = Array.isArray(payload?.sugestoes) ? payload.sugestoes : [];
  return suggestions.map((item) => ({
    macro: item?.macro,
    item: item?.item,
    score: item?.score
  }));
};

export const fetchLatestClassification = async (
  conversaId: number
): Promise<{ classificacao: ClassificationRecord | null; snapshot: ClassificationSnapshot | null }> => {
  const response = await fetch(buildApiUrl(`/api/conversas/${conversaId}/classificacao`), {
    method: 'GET',
    headers: buildHeaders()
  });

  const payload = await ensureOk(response).then(parseJson);

  const rawClassification = payload?.classificacao;
  const rawSnapshot = payload?.snapshot;

  const classificacao = rawClassification
    ? {
        id: rawClassification.id,
        conversaId: rawClassification.conversa_id ?? conversaId,
        macro: rawClassification.macro,
        item: rawClassification.item,
        origem: rawClassification.origem,
        confianca: rawClassification.confianca ?? null,
        criadoPor: rawClassification.criado_por ?? null,
        criadoEm: rawClassification.criado_em
      }
    : null;

  const snapshot: ClassificationSnapshot | null = rawSnapshot
    ? {
        macro: rawSnapshot.macro ?? null,
        item: rawSnapshot.item ?? null,
        classificadoPor: rawSnapshot.classificado_por ?? null,
        classificadoEm: rawSnapshot.classificado_em ?? null
      }
    : null;

  return { classificacao, snapshot };
};

export const applyClassification = async (
  conversaId: number,
  payload: {
    macro: string;
    item: string;
    origem?: string;
    confianca?: number | null;
    usuario?: string;
  }
) => {
  const response = await fetch(buildApiUrl(`/api/conversas/${conversaId}/classificacao`), {
    method: 'PUT',
    headers: buildHeaders(),
    body: JSON.stringify({
      macro: payload.macro,
      item: payload.item,
      ...(payload.origem ? { origem: payload.origem } : {}),
      ...(typeof payload.confianca === 'number' ? { confianca: payload.confianca } : {}),
      ...(payload.usuario ? { usuario: payload.usuario } : {})
    })
  });

  const data = await ensureOk(response).then(parseJson);
  return data?.classificacao || null;
};

export const fetchMessageClassification = async (
  messageId: number
): Promise<MessageClassificationRecord | null> => {
  const response = await fetch(buildApiUrl(`/api/classificacao/mensagem/${messageId}`), {
    method: 'GET',
    headers: buildHeaders()
  });

  const payload = await ensureOk(response).then(parseJson);
  const classificacao = payload?.classificacao;

  if (!classificacao) {
    return null;
  }

  return {
    id: classificacao.id,
    messageId: classificacao.message_id,
    conversaId: classificacao.conversa_id,
    userId: classificacao.user_id,
    macro: classificacao.macro,
    item: classificacao.item,
    comentario: classificacao.comentario ?? null,
    createdAt: classificacao.created_at,
    updatedAt: classificacao.updated_at
  };
};

export const upsertMessageClassification = async (payload: {
  messageId: number;
  conversaId?: number;
  macro: string;
  item: string;
}): Promise<MessageClassificationRecord> => {
  const response = await fetch(buildApiUrl('/api/classificacao/mensagem'), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      messageId: payload.messageId,
      ...(payload.conversaId ? { conversaId: payload.conversaId } : {}),
      macro: payload.macro,
      item: payload.item
    })
  });

  const data = await ensureOk(response).then(parseJson);
  const classificacao = data?.classificacao;

  return {
    id: classificacao.id,
    messageId: classificacao.message_id,
    conversaId: classificacao.conversa_id,
    userId: classificacao.user_id,
    macro: classificacao.macro,
    item: classificacao.item,
    comentario: classificacao.comentario ?? null,
    createdAt: classificacao.created_at,
    updatedAt: classificacao.updated_at
  };
};

const normalizeCatalogItem = (raw: any): ClassificacaoCatalogoItem => {
  if (!raw) {
    return {
      id: 0,
      macro: '',
      item: '',
      slug: '',
      descricao: null,
      cor_hex: null,
      prioridade: 0,
      ativo: false,
      deleted_at: null,
      created_at: '',
      updated_at: ''
    };
  }

  return {
    id: Number(raw.id) || 0,
    macro: raw.macro ?? '',
    item: raw.item ?? '',
    slug: raw.slug ?? '',
    descricao: raw.descricao ?? null,
    cor_hex: raw.cor_hex ?? null,
    prioridade: Number(raw.prioridade) || 0,
    ativo: Boolean(raw.ativo),
    deleted_at: raw.deleted_at ?? null,
    created_at: raw.created_at ?? '',
    updated_at: raw.updated_at ?? ''
  };
};

export const listClassificacoes = async (
  params: ListClassificacoesParams = {}
): Promise<ListClassificacoesResponse> => {
  const query = new URLSearchParams();

  if (params.q) {
    query.set('q', params.q);
  }
  if (params.ativo) {
    query.set('ativo', params.ativo);
  }
  if (params.page) {
    query.set('page', String(params.page));
  }
  if (params.pageSize) {
    query.set('pageSize', String(params.pageSize));
  }
  if (params.sort) {
    query.set('sort', params.sort);
  }

  const queryString = query.toString();
  const url = buildApiUrl(`/api/classificacoes${queryString ? `?${queryString}` : ''}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders()
  });

  const payload = await ensureOk(response).then(parseJson);
  const items = Array.isArray(payload?.data) ? payload.data : [];

  return {
    data: items.map(normalizeCatalogItem),
    total: Number(payload?.total) || 0,
    page: Number(payload?.page) || 1,
    pageSize: Number(payload?.pageSize) || 20
  };
};

export const createClassificacao = async (
  payload: ClassificacaoPayload
): Promise<ClassificacaoCatalogoItem> => {
  const response = await fetch(buildApiUrl('/api/classificacoes'), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload)
  });

  const data = await ensureOk(response).then(parseJson);
  return normalizeCatalogItem(data?.data);
};

export const updateClassificacao = async (
  id: number,
  payload: UpdateClassificacaoPayload
): Promise<ClassificacaoCatalogoItem> => {
  const response = await fetch(buildApiUrl(`/api/classificacoes/${id}`), {
    method: 'PATCH',
    headers: buildHeaders(),
    body: JSON.stringify(payload)
  });

  const data = await ensureOk(response).then(parseJson);
  return normalizeCatalogItem(data?.data);
};

export const toggleClassificacao = async (id: number): Promise<ClassificacaoCatalogoItem> => {
  const response = await fetch(buildApiUrl(`/api/classificacoes/${id}/toggle`), {
    method: 'POST',
    headers: buildHeaders()
  });

  const data = await ensureOk(response).then(parseJson);
  return normalizeCatalogItem(data?.data);
};

export const deleteClassificacao = async (id: number): Promise<void> => {
  const response = await fetch(buildApiUrl(`/api/classificacoes/${id}`), {
    method: 'DELETE',
    headers: buildHeaders()
  });

  await ensureOk(response).then(parseJson);
};

export const importClassificacoes = async (
  file: File
): Promise<ImportClassificacaoReportLine[]> => {
  const formData = new FormData();
  formData.append('file', file);

  const headers = buildHeaders({ contentType: null });

  const response = await fetch(buildApiUrl('/api/classificacoes/import'), {
    method: 'POST',
    headers,
    body: formData
  });

  const payload = await ensureOk(response).then(parseJson);
  return Array.isArray(payload?.report) ? payload.report : [];
};

export const exportClassificacoesUrl = (): string => {
  return buildApiUrl('/api/classificacoes/export');
};
