import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import HistoricoResumido from '../components/conversas/HistoricoResumido';
import Header from '../components/Header.jsx';
import { fetchConversationsWithContext, type ConversaComContexto } from '../services/conversaContextoApi';
import { getConversationUrl } from '../utils/routes';

type ConversationSearchIndex = {
  item: ConversaComContexto;
  normalizedName: string;
  normalizedChatId: string;
  nameTokens: string[];
};

const normalizeText = (value: string): string => {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

const computeMatchScore = (
  entry: ConversationSearchIndex,
  normalizedQuery: string,
  queryTokens: string[]
): number => {
  if (!normalizedQuery) return 0;

  let score = 0;
  let matchedTokens = 0;

  if (entry.normalizedName === normalizedQuery) {
    score += 140;
  } else if (entry.normalizedName.startsWith(normalizedQuery)) {
    score += 90;
  } else if (entry.normalizedName.includes(normalizedQuery)) {
    score += 45;
  }

  if (entry.normalizedChatId.startsWith(normalizedQuery)) {
    score += 30;
  } else if (entry.normalizedChatId.includes(normalizedQuery)) {
    score += 12;
  }

  for (const token of queryTokens) {
    const tokenInName = entry.nameTokens.some((value) => value === token);
    const prefixInName = entry.nameTokens.some((value) => value.startsWith(token));
    const partialInName = entry.normalizedName.includes(token);
    const tokenInId = entry.normalizedChatId.includes(token);

    if (tokenInName) {
      score += 32;
      matchedTokens += 1;
    } else if (prefixInName) {
      score += 20;
      matchedTokens += 1;
    } else if (partialInName) {
      score += 12;
      matchedTokens += 1;
    } else if (tokenInId) {
      score += 8;
      matchedTokens += 1;
    }
  }

  if (queryTokens.length > 0) {
    const coverage = matchedTokens / queryTokens.length;
    score += coverage * 25;
    if (matchedTokens === 0) {
      score -= 25;
    }
  }

  score += Math.min(entry.item.total_contextos, 500) * 0.02;

  return Math.max(score, 0);
};

const ContextoPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversas, setConversas] = useState<ConversaComContexto[]>([]);
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('busca') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => (searchParams.get('busca') ?? '').trim());

  const selectedParam = searchParams.get('conversaId');

  const selectedConversation = useMemo(() => {
    if (!selectedParam) return null;
    return conversas.find((item) => String(item.conversa_id) === selectedParam) || null;
  }, [conversas, selectedParam]);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchConversationsWithContext();
        if (!controller.signal.aborted) {
          setConversas(result);
        }
      } catch (err: any) {
        if (!controller.signal.aborted) {
          setError(err?.message || 'Erro ao carregar conversas com contexto');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const nextValue = searchParams.get('busca') ?? '';
    setSearchTerm((prev) => (prev === nextValue ? prev : nextValue));
  }, [searchParams]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 250);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [searchTerm]);

  useEffect(() => {
    const normalized = debouncedSearch.trim();
    const current = searchParams.get('busca') ?? '';
    if (normalized === current) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    if (normalized) {
      nextParams.set('busca', normalized);
    } else {
      nextParams.delete('busca');
    }
    setSearchParams(nextParams, { replace: true });
  }, [debouncedSearch, searchParams, setSearchParams]);

  const searchIndex = useMemo<ConversationSearchIndex[]>(() => {
    return conversas.map((item) => {
      const normalizedName = normalizeText(item.nome);
      const normalizedChatId = normalizeText(item.chat_id);
      const nameTokens = normalizedName.split(/\s+/).filter(Boolean);
      return {
        item,
        normalizedName,
        normalizedChatId,
        nameTokens
      };
    });
  }, [conversas]);

  const normalizedQuery = useMemo(() => normalizeText(debouncedSearch), [debouncedSearch]);
  const queryTokens = useMemo(
    () => normalizedQuery.split(/\s+/).filter(Boolean),
    [normalizedQuery]
  );

  const filteredConversas = useMemo(() => {
    if (!normalizedQuery) {
      return conversas;
    }

    const results = searchIndex
      .map((entry) => ({
        entry,
        score: computeMatchScore(entry, normalizedQuery, queryTokens)
      }))
      .filter((candidate) => candidate.score > 0);

    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.entry.item.nome.localeCompare(b.entry.item.nome, 'pt-BR', {
        sensitivity: 'base',
        numeric: true
      });
    });

    return results.map((candidate) => candidate.entry.item);
  }, [conversas, normalizedQuery, queryTokens, searchIndex]);

  const totalConversas = conversas.length;
  const filteredCount = filteredConversas.length;
  const isFiltering = normalizedQuery.length > 0;
  const noResults = !loading && isFiltering && filteredCount === 0;

  const isSelectedVisible = Boolean(
    selectedParam && filteredConversas.some((item) => String(item.conversa_id) === selectedParam)
  );

  useEffect(() => {
    if (loading) {
      return;
    }

    if (filteredConversas.length === 0) {
      if (selectedParam) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('conversaId');
        setSearchParams(nextParams, { replace: true });
      }
      return;
    }

    if (!selectedParam || !isSelectedVisible) {
      const fallbackId = String(filteredConversas[0].conversa_id);
      if (selectedParam === fallbackId) {
        return;
      }
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('conversaId', fallbackId);
      setSearchParams(nextParams, { replace: true });
    }
  }, [
    filteredConversas,
    isSelectedVisible,
    loading,
    searchParams,
    selectedParam,
    setSearchParams
  ]);

  const handleSelectGroup = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;
    const nextParams = new URLSearchParams(searchParams);
    if (!nextValue) {
      nextParams.delete('conversaId');
    } else {
      nextParams.set('conversaId', nextValue);
    }
    setSearchParams(nextParams, { replace: true });
  };

  const handleOpenRange = (range: { from?: string | null; to?: string | null }) => {
    if (!selectedConversation?.chat_id) {
      return;
    }

    const params = new URLSearchParams();
    if (range?.from) {
      params.set('from', range.from);
    }
    if (range?.to) {
      params.set('to', range.to);
    }

    const suffix = params.toString();
    const query = suffix ? `?${suffix}` : '';
    const conversationUrl = getConversationUrl(selectedConversation.chat_id, selectedConversation.tipo);
    navigate(`${conversationUrl}${query}`);
  };

  const selectValue = isSelectedVisible && selectedParam ? selectedParam : '';

  return (
    <div className="flex h-screen w-full justify-center bg-wa-bg transition-colors">
      <div className="flex h-full w-full max-w-[1400px] flex-col overflow-hidden bg-wa-panel text-wa-text-primary transition-colors">
        <Header />
        <main className="flex flex-1 min-h-0 flex-col bg-wa-panel text-wa-text-primary">
          <header className="border-b border-wa-border px-6 py-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-wa-text-primary">Contextos de Conversa</h1>
                <p className="mt-2 max-w-3xl text-sm text-wa-text-secondary">
                  Consulte resumos consolidados das conversas, filtre por período e abra rapidamente o trecho desejado
                  no painel de mensagens.
                </p>
              </div>
            </div>
          </header>

          <div className="flex flex-1 min-h-0 flex-col overflow-hidden px-6 py-6">
            <div className="flex flex-1 min-h-0 flex-col gap-6 lg:flex-row">
              <section className="w-full max-w-[360px] flex-shrink-0 rounded-2xl border border-wa-border bg-wa-panel-header px-4 py-5">
                <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label
                  className="text-xs font-semibold uppercase tracking-wide text-wa-text-secondary"
                  htmlFor="contexto-search-input"
                >
                  Buscar conversa
                </label>
                <div className="relative">
                  <input
                    id="contexto-search-input"
                    type="search"
                    inputMode="search"
                    autoComplete="off"
                    spellCheck={false}
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Digite o nome ou ID do grupo"
                    disabled={loading && conversas.length === 0}
                    className="w-full rounded-md border border-wa-border bg-wa-bg px-3 py-2 pr-16 text-sm text-wa-text-primary outline-none transition-colors focus:border-wa-link focus:ring-1 focus:ring-wa-link disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  {searchTerm.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute inset-y-0 right-3 flex items-center text-xs font-semibold uppercase tracking-wide text-wa-text-tertiary transition-colors hover:text-wa-text-secondary focus:text-wa-text-secondary focus:outline-none"
                      aria-label="Limpar busca"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                <label
                  className="mt-3 text-xs font-semibold uppercase tracking-wide text-wa-text-secondary"
                  htmlFor="contexto-conversa-select"
                >
                  Selecionar conversa
                </label>
                <select
                  id="contexto-conversa-select"
                  value={selectValue}
                  onChange={handleSelectGroup}
                  disabled={loading || filteredConversas.length === 0}
                  className="rounded-md border border-wa-border bg-wa-bg px-3 py-2 text-sm text-wa-text-primary outline-none transition-colors focus:border-wa-link focus:ring-1 focus:ring-wa-link disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading && <option value="">Carregando conversas…</option>}
                  {!loading && filteredConversas.length === 0 && (
                    <option value="" disabled>
                      {isFiltering ? 'Nenhuma conversa corresponde à busca' : 'Nenhuma conversa disponível'}
                    </option>
                  )}
                  {!loading &&
                    filteredConversas.map((item) => (
                      <option key={item.conversa_id} value={item.conversa_id}>
                        {item.nome} ({item.total_contextos})
                      </option>
                    ))}
                </select>
                <p className="text-xs text-wa-text-secondary" aria-live="polite">
                  {loading
                    ? 'Carregando conversas…'
                    : noResults
                    ? 'Nenhuma conversa corresponde aos termos pesquisados.'
                    : isFiltering
                    ? `Mostrando ${filteredCount} de ${totalConversas} conversas com contexto.`
                    : `Total de conversas com contexto: ${totalConversas}.`}
                </p>
                {error && (
                  <p className="text-xs text-wa-system-red">
                    {error}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-wa-border/60 bg-wa-panel px-3 py-4 text-sm text-wa-text-secondary">
                <p className="font-medium text-wa-text-primary">Como funciona</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed">
                  <li>Use o período, busca e ordenação para refinar os blocos.</li>
                  <li>Clique em “Abrir mensagens do período” para ir direto ao chat.</li>
                  <li>A ordenação “Similaridade” funciona com busca por termo.</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-wa-border bg-wa-panel-header">
            {noResults ? (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-wa-text-secondary">
                Ajuste os termos da busca ou limpe o filtro para visualizar as conversas disponíveis.
              </div>
            ) : selectedConversation ? (
              <HistoricoResumido
                conversaId={String(selectedConversation.conversa_id)}
                onSelectRange={handleOpenRange}
                activeRange={null}
                layout="wide"
              />
            ) : (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-wa-text-secondary">
                {loading
                  ? 'Carregando conversas...'
                  : 'Selecione uma conversa para visualizar o histórico resumido.'}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  </div>
</div>
  );
};

export default ContextoPage;
