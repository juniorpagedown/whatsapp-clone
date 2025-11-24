import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  ConversaContextoItem,
  fetchConversationContexts
} from '../../services/conversaContextoApi';

type HistoricoResumidoProps = {
  conversaId: string;
  onSelectRange?: (range: { from?: string | null; to?: string | null }) => void;
  activeRange?: { from?: string | null; to?: string | null };
  layout?: 'sidebar' | 'wide';
};

const PAGE_SIZE = 6;
const SUMMARY_PREVIEW_LIMIT = 320;

const createDefaultMeta = (sort: 'recent' | 'oldest' | 'sim') => ({
  limit: PAGE_SIZE,
  offset: 0,
  count: 0,
  has_more: false,
  sort
});

const formatDateTime = (value: string | null): string => {
  if (!value) return 'Período indeterminado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
};

const formatPeriod = (contexto: ConversaContextoItem): string => {
  return `${formatDateTime(contexto.periodo_inicio)} → ${formatDateTime(contexto.periodo_fim)}`;
};

const toIsoString = (value: string): string | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
};

const HistoricoResumido: React.FC<HistoricoResumidoProps> = ({
  conversaId,
  onSelectRange,
  activeRange,
  layout = 'sidebar'
}) => {
  const [sort, setSort] = useState<'recent' | 'oldest' | 'sim'>('recent');
  const [fromValue, setFromValue] = useState('');
  const [toValue, setToValue] = useState('');
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<ConversaContextoItem[]>([]);
  const [meta, setMeta] = useState(() => createDefaultMeta('recent'));
  const [loading, setLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const loadMoreRequestedRef = useRef(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(searchTerm.trim());
    }, 300);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [searchTerm]);

  useEffect(() => {
    setItems([]);
    setMeta(createDefaultMeta(sort));
    setExpanded(new Set());
    setOffset(0);
    loadMoreRequestedRef.current = false;
  }, [conversaId, sort, debouncedQuery, fromValue, toValue]);

  useEffect(() => {
    const isFirstPage = offset === 0;
    const currentLimit = meta.limit || PAGE_SIZE;

    if (!conversaId) {
      setItems([]);
      setMeta((prev) => ({ ...prev, count: 0, has_more: false, offset: 0 }));
      setLoading(false);
      setIsLoadingMore(false);
      setError(null);
      return undefined;
    }

    if (sort === 'sim' && debouncedQuery.length < 2) {
      setItems([]);
      setMeta(createDefaultMeta(sort));
      setLoading(false);
      setIsLoadingMore(false);
      setError(null);
      return undefined;
    }

    const controller = new AbortController();

    const load = async () => {
      if (isFirstPage) {
        setLoading(true);
        setError(null);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const response = await fetchConversationContexts({
          conversaId,
          limit: currentLimit,
          offset,
          sort,
          from: toIsoString(fromValue),
          to: toIsoString(toValue),
          q: sort === 'sim' ? debouncedQuery : undefined,
          signal: controller.signal
        });

        setItems((prev) => {
          const nextItems = isFirstPage ? response.data : [...prev, ...response.data];
          setMeta({
            limit: response.meta.limit || currentLimit,
            offset: response.meta.offset ?? offset,
            count: response.meta.count ?? nextItems.length,
            has_more: Boolean(response.meta.has_more),
            sort: response.meta.sort || sort
          });
          if (!Boolean(response.meta.has_more)) {
            loadMoreRequestedRef.current = false;
          }
          return nextItems;
        });
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return;
        }
        setError(err?.message || 'Erro ao carregar contextos');
        if (!isFirstPage) {
          setOffset((prev) => {
            if (prev === 0) return prev;
            const next = Math.max(0, prev - currentLimit);
            return next;
          });
        }
      } finally {
        if (isFirstPage) {
          setLoading(false);
        } else {
          setIsLoadingMore(false);
          loadMoreRequestedRef.current = false;
        }
      }
    };

    load();

    return () => controller.abort();
  }, [conversaId, offset, sort, debouncedQuery, fromValue, toValue, meta.limit]);

  const handleLoadMore = useCallback(() => {
    if (loading || isLoadingMore || !meta.has_more || loadMoreRequestedRef.current) {
      return;
    }
    loadMoreRequestedRef.current = true;
    const step = meta.limit || PAGE_SIZE;
    setOffset((prev) => prev + step);
  }, [isLoadingMore, loading, meta.has_more, meta.limit]);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (!meta.has_more || loading || isLoadingMore) {
        return;
      }

      const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
      if (scrollHeight - (scrollTop + clientHeight) < 160) {
        handleLoadMore();
      }
    },
    [handleLoadMore, isLoadingMore, loading, meta.has_more]
  );

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectRange = (item: ConversaContextoItem) => {
    onSelectRange?.({
      from: item.periodo_inicio,
      to: item.periodo_fim
    });
  };

  const handleClearPeriod = () => {
    setFromValue('');
    setToValue('');
  };

  const isActiveRange = (item: ConversaContextoItem) => {
    if (!activeRange) return false;
    const fromMatches = activeRange.from ? activeRange.from === item.periodo_inicio : false;
    const toMatches = activeRange.to ? activeRange.to === item.periodo_fim : false;
    return fromMatches && toMatches;
  };

  const containerClass =
    layout === 'wide'
      ? 'flex h-full min-h-0 w-full max-w-full flex-col bg-wa-panel text-wa-text-primary'
      : 'flex h-full min-h-0 min-w-[320px] max-w-[420px] flex-col border-l border-wa-border bg-wa-panel text-wa-text-primary';

  return (
    <aside className={containerClass}>
      <header
        className={`border-b border-wa-border px-4 py-3 ${
          layout === 'wide' ? 'bg-wa-panel-header/60' : ''
        }`}
      >
        <h2 className="text-[15px] font-semibold text-wa-text-primary">Histórico resumido</h2>
        <p className="mt-1 text-sm text-wa-text-secondary">
          Explore blocos consolidados da conversa e abra o período correspondente.
        </p>
        {activeRange && (
          <button
            type="button"
            onClick={() => onSelectRange?.({ from: null, to: null })}
            className="mt-2 text-xs font-semibold text-wa-link hover:underline"
            aria-label="Limpar seleção de período"
          >
            Limpar seleção ativa
          </button>
        )}
      </header>

      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <div className="border-b border-wa-border px-4 py-3">
          <div className={`flex flex-col gap-3 ${layout === 'wide' ? 'lg:grid lg:grid-cols-2 lg:gap-4' : ''}`}>
            <div className={layout === 'wide' ? 'max-w-xs' : ''}>
              <span className="block text-xs font-semibold uppercase tracking-wide text-wa-text-secondary">
                Período
              </span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-wa-text-secondary">
                  Início
                  <input
                    type="datetime-local"
                    value={fromValue}
                    onChange={(event) => setFromValue(event.target.value)}
                    aria-label="Data inicial do período"
                    className="rounded-md border border-wa-border bg-wa-bg px-2 py-1 text-sm text-wa-text-primary outline-none focus:border-wa-link focus:ring-1 focus:ring-wa-link"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-wa-text-secondary">
                  Fim
                  <input
                    type="datetime-local"
                    value={toValue}
                    onChange={(event) => setToValue(event.target.value)}
                    aria-label="Data final do período"
                    className="rounded-md border border-wa-border bg-wa-bg px-2 py-1 text-sm text-wa-text-primary outline-none focus:border-wa-link focus:ring-1 focus:ring-wa-link"
                  />
                </label>
              </div>
              {(fromValue || toValue) && (
                <button
                  type="button"
                  onClick={handleClearPeriod}
                  className="mt-2 w-max text-xs font-semibold text-wa-link hover:underline"
                  aria-label="Limpar filtro de período"
                >
                  Limpar período
                </button>
              )}
            </div>

            <div className={layout === 'wide' ? 'max-w-xs' : ''}>
              <label className="flex flex-col gap-1 text-xs text-wa-text-secondary">
                Busca por termo
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Ex.: reembolso, atraso..."
                  aria-label="Buscar por tema ou palavra-chave"
                  className="w-full rounded-md border border-wa-border bg-wa-bg px-2 py-1 text-sm text-wa-text-primary outline-none focus:border-wa-link focus:ring-1 focus:ring-wa-link"
                />
              </label>
              {sort === 'sim' && debouncedQuery.length < 2 && (
                <span className="mt-1 block text-xs text-wa-text-secondary/70">
                  Digite ao menos 2 caracteres para buscar por similaridade.
                </span>
              )}
            </div>

            <div>
              <label className="flex flex-col gap-1 text-xs text-wa-text-secondary">
                Ordenação
                <select
                  value={sort}
                  onChange={(event) => {
                    const nextSort = event.target.value as 'recent' | 'oldest' | 'sim';
                    setSort(nextSort);
                  }}
                  aria-label="Ordenar contextos"
                  className="w-full rounded-md border border-wa-border bg-wa-bg px-2 py-1 text-sm text-wa-text-primary outline-none focus:border-wa-link focus:ring-1 focus:ring-wa-link"
                >
                  <option value="recent">Mais recentes</option>
                  <option value="oldest">Mais antigos</option>
                  <option value="sim">Similaridade</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div
          className={`flex-1 overflow-y-auto px-4 py-3 ${layout === 'wide' ? 'bg-wa-panel' : ''}`}
          onScroll={handleScroll}
        >
          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {!error && loading && items.length === 0 && (
            <div className="py-8 text-center text-sm text-wa-text-secondary">
              Carregando contextos…
            </div>
          )}

          {!error && !loading && items.length === 0 && (
            <div className="py-8 text-center text-sm text-wa-text-secondary">
              Nenhum contexto encontrado para os filtros selecionados.
            </div>
          )}

          <div className="flex flex-col gap-3">
            {items.map((item) => {
              const isExpanded = expanded.has(item.id);
              const summaryText = (item.resumo || 'Sem resumo disponível.').trim();
              const previewText =
                summaryText.length > SUMMARY_PREVIEW_LIMIT
                  ? `${summaryText.slice(0, SUMMARY_PREVIEW_LIMIT)}…`
                  : summaryText;
              const displayText = isExpanded ? summaryText : previewText;
              const shouldShowToggle = summaryText.length > SUMMARY_PREVIEW_LIMIT;
              const isActive = isActiveRange(item);

              return (
                <article
                  key={item.id}
                  className={`rounded-xl border border-wa-border/60 bg-wa-bg/40 p-4 shadow-sm transition-colors ${
                    isActive ? 'border-wa-link' : ''
                  }`}
                  aria-label={`Contexto do período ${formatPeriod(item)}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-wa-text-secondary">
                      Período
                    </span>
                    {typeof item.score_sim === 'number' && (
                      <span className="rounded-full bg-wa-chip-bg px-2 py-0.5 text-xs font-semibold text-wa-link">
                        Score {item.score_sim.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm font-medium text-wa-text-primary">{formatPeriod(item)}</div>
                  <div className="mt-3 text-sm text-wa-text-secondary">
                    <p className="whitespace-pre-line">{displayText}</p>
                    {shouldShowToggle && (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(item.id)}
                        className="mt-2 text-xs font-semibold text-wa-link hover:underline"
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? 'Ver menos do resumo' : 'Ver mais do resumo'}
                      >
                        {isExpanded ? 'Ver menos' : 'Ver mais'}
                      </button>
                    )}
                  </div>

                  {item.temas_principais.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.temas_principais.map((tema) => (
                        <span
                          key={`${item.id}-${tema}`}
                          className="rounded-full bg-wa-chip-bg px-2 py-0.5 text-xs text-wa-text-secondary"
                        >
                          {tema}
                        </span>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleSelectRange(item)}
                    className="mt-3 text-sm font-semibold text-wa-link hover:underline"
                    aria-label="Abrir mensagens do período"
                  >
                    Abrir mensagens do período
                  </button>
                </article>
              );
            })}
          </div>
        </div>

        <div className="border-t border-wa-border px-4 py-3">
          <div className="flex flex-col gap-2 text-xs text-wa-text-secondary sm:flex-row sm:items-center sm:justify-between">
            <span>
              {meta.count > 0
                ? `Mostrando ${items.length} de ${meta.count} blocos consolidados.`
                : items.length > 0
                ? `Mostrando ${items.length} blocos consolidados.`
                : 'Nenhum bloco carregado.'}
            </span>
            {meta.has_more && (
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loading || isLoadingMore}
                className="self-start rounded-md border border-wa-border px-3 py-1 text-sm font-semibold text-wa-text-primary transition-colors hover:border-wa-link hover:text-wa-link disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingMore ? 'Carregando…' : 'Carregar mais'}
              </button>
            )}
          </div>
          {isLoadingMore && (
            <div className="mt-2 text-center text-xs text-wa-text-secondary">Buscando mais contextos…</div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default HistoricoResumido;
