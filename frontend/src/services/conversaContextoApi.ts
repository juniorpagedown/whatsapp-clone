import { buildApiUrl } from '../utils/api';

export type ConversaContextoItem = {
  id: number;
  conversa_id: number;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  total_mensagens: number;
  resumo: string;
  temas_principais: string[];
  created_at: string | null;
  score_sim?: number;
};

export type ConversaContextoResponse = {
  data: ConversaContextoItem[];
  meta: {
    limit: number;
    offset: number;
    count: number;
    has_more: boolean;
    sort?: string;
  };
};

export type ConversaComContexto = {
  conversa_id: number;
  chat_id: string;
  tipo: string;
  grupo_id: number | null;
  nome: string;
  total_contextos: number;
  ultimo_periodo: string | null;
};

export type FetchContextsParams = {
  conversaId: string | number;
  limit?: number;
  offset?: number;
  sort?: 'recent' | 'oldest' | 'sim';
  from?: string;
  to?: string;
  q?: string;
  signal?: AbortSignal;
};

const normalizeThemes = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : null))
      .filter((item): item is string => Boolean(item && item.length > 0));
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return normalizeThemes(parsed);
      }
    } catch {
      return value
        .split(/[;,]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
  }
  if (value && typeof value === 'object') {
    try {
      return normalizeThemes(Object.values(value as Record<string, unknown>).flat());
    } catch {
      return [];
    }
  }
  return [];
};

const normalizeItem = (item: any): ConversaContextoItem => ({
  id: Number(item.id),
  conversa_id: Number(item.conversa_id),
  periodo_inicio: item.periodo_inicio || null,
  periodo_fim: item.periodo_fim || null,
  total_mensagens: Number(item.total_mensagens || 0),
  resumo: typeof item.resumo === 'string' ? item.resumo : '',
  temas_principais: normalizeThemes(item.temas_principais),
  created_at: item.created_at || null,
  score_sim: item.score_sim !== undefined && item.score_sim !== null
    ? Number(item.score_sim)
    : undefined
});

export const fetchConversationContexts = async ({
  conversaId,
  limit,
  offset,
  sort,
  from,
  to,
  q,
  signal
}: FetchContextsParams): Promise<ConversaContextoResponse> => {
  const params = new URLSearchParams();
  if (typeof limit === 'number') params.set('limit', String(limit));
  if (typeof offset === 'number') params.set('offset', String(offset));
  if (sort) params.set('sort', sort);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (q) params.set('q', q);

  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(
    buildApiUrl(`/api/conversas/${conversaId}/contextos?${params.toString()}`),
    {
      method: 'GET',
      headers,
      signal
    }
  );

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const message = errorPayload?.error?.message || `Erro ao carregar contextos (${response.status})`;
    const error = new Error(message) as Error & { code?: string };
    if (errorPayload?.error?.code) {
      error.code = errorPayload.error.code;
    }
    throw error;
  }

  const payload = await response.json();
  const itemsRaw = Array.isArray(payload?.data) ? payload.data : [];

  return {
    data: itemsRaw.map(normalizeItem),
    meta: {
      limit: Number(payload?.meta?.limit ?? limit ?? 0),
      offset: Number(payload?.meta?.offset ?? offset ?? 0),
      count: Number(payload?.meta?.count ?? itemsRaw.length ?? 0),
      has_more: Boolean(payload?.meta?.has_more),
      sort: payload?.meta?.sort
    }
  };
};

export const fetchConversationsWithContext = async (): Promise<ConversaComContexto[]> => {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildApiUrl('/api/conversas/contextos/disponiveis'), {
    method: 'GET',
    headers
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.error?.message || 'Erro ao carregar conversas com contexto';
    throw new Error(message);
  }

  const payload = await response.json();
  const items = Array.isArray(payload?.data) ? payload.data : [];

  return items.map((item: any) => ({
    conversa_id: Number(item.conversa_id),
    chat_id: String(item.chat_id),
    tipo: item.tipo,
    grupo_id: item.grupo_id === null || item.grupo_id === undefined ? null : Number(item.grupo_id),
    nome: typeof item.nome === 'string' ? item.nome : String(item.chat_id),
    total_contextos: Number(item.total_contextos || 0),
    ultimo_periodo: item.ultimo_periodo || null
  }));
};
