import React, {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header.jsx';
import {
  AuditDetailResponse,
  AuditHistoryItem,
  AuditHistorySummary,
  fetchAuditDetails,
  fetchAuditHistory,
  reopenAudit
} from '../services/auditoriaApi.ts';

const PAGE_SIZE = 20;

type FiltersState = {
  status: 'todos' | 'concluida' | 'reaberta' | 'cancelada';
  tipoConversa: 'todos' | 'grupo' | 'individual';
  hasObs: 'todos' | 'com' | 'sem';
  dtStart: string;
  dtEnd: string;
  usuarioId: string;
  conversaId: string;
  nomeConversa: string;
  qtdMin: string;
};

const defaultFilters: FiltersState = {
  status: 'todos',
  tipoConversa: 'todos',
  hasObs: 'todos',
  dtStart: '',
  dtEnd: '',
  usuarioId: '',
  conversaId: '',
  nomeConversa: '',
  qtdMin: ''
};

type DetailsModalProps = {
  open: boolean;
  data: AuditDetailResponse | null;
  loading: boolean;
  onClose: () => void;
};

const DetailsModal = ({
  open,
  data,
  loading,
  onClose
}: DetailsModalProps) => {
  if (!open) return null;

  const auditoria = data?.auditoria;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-wa-bg/70 p-4 backdrop-blur">
      <div className="h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg border border-wa-border bg-wa-panel shadow-xl">
        <div className="flex items-center justify-between border-b border-wa-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-wa-text-primary">
              Detalhes da auditoria #{auditoria?.id}
            </h2>
            <p className="text-sm text-wa-text-secondary">
              Período: {auditoria?.dataInicio ? new Date(auditoria.dataInicio).toLocaleString('pt-BR') : '—'}
              {' '}
              até {auditoria?.dataFim ? new Date(auditoria.dataFim).toLocaleString('pt-BR') : '—'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-wa-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-wa-text-secondary transition-colors hover:border-wa-primary hover:text-wa-text-primary"
          >
            Fechar
          </button>
        </div>

        <div className="h-full overflow-auto px-6 py-4">
          {loading && (
            <div className="flex h-40 items-center justify-center text-wa-text-secondary">
              Carregando detalhes...
            </div>
          )}

          {!loading && auditoria && (
            <div className="space-y-4 text-sm text-wa-text-secondary">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="text-xs uppercase tracking-wide text-wa-text-secondary/80">Conversa</h3>
                  <p className="text-wa-text-primary">
                    {auditoria.conversa?.nome || auditoria.conversa?.chatId || `#${auditoria.conversaId}`}
                  </p>
                </div>
                <div>
                  <h3 className="text-xs uppercase tracking-wide text-wa-text-secondary/80">Responsável</h3>
                  <p className="text-wa-text-primary">{auditoria.usuario?.nome || auditoria.usuarioId}</p>
                </div>
                <div>
                  <h3 className="text-xs uppercase tracking-wide text-wa-text-secondary/80">Status</h3>
                  <p className="text-wa-text-primary capitalize">{auditoria.status}</p>
                </div>
                <div>
                  <h3 className="text-xs uppercase tracking-wide text-wa-text-secondary/80">Quantidade</h3>
                  <p className="text-wa-text-primary">{auditoria.qtdMensagens} mensagem(ns)</p>
                </div>
              </div>

              {auditoria.observacao && (
                <div>
                  <h3 className="text-xs uppercase tracking-wide text-wa-text-secondary/80">Observação</h3>
                  <p className="whitespace-pre-wrap rounded border border-wa-border bg-wa-bg px-3 py-2 text-wa-text-primary">
                    {auditoria.observacao}
                  </p>
                </div>
              )}

              <div>
                <h3 className="text-xs uppercase tracking-wide text-wa-text-secondary/80 mb-2">Mensagens do período</h3>
                <div className="flex flex-col gap-3">
                  {data?.mensagens?.map((message) => (
                    <div
                      key={message.id}
                      className="rounded border border-wa-border bg-wa-panel-header/40 px-3 py-2 text-wa-text-primary shadow-sm"
                    >
                      {message.senderName && (
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-wide text-wa-text-secondary">
                          <span className="font-semibold text-wa-link">
                            {message.senderName}
                          </span>
                          {message.senderPhone && (
                            <span className="text-wa-text-secondary/80">
                              {message.senderPhone}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="text-sm whitespace-pre-wrap break-words">
                        {message.texto || <span className="italic text-wa-text-secondary">Mensagem sem texto</span>}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-wa-text-secondary/80">
                        <span>{new Date(message.timestamp).toLocaleString('pt-BR')}</span>
                        {message.classificacoes.length > 0 && (
                          <span className="rounded-full bg-wa-system-green/20 px-2 py-1 font-semibold uppercase tracking-wide text-wa-system-green">
                            Classificada
                          </span>
                        )}
                      </div>
                    </div>
                  ))}

                  {!data?.mensagens?.length && (
                    <div className="text-xs text-wa-text-secondary">
                      Nenhuma mensagem cadastrada para este período.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'concluida':
      return 'Concluída';
    case 'reaberta':
      return 'Reaberta';
    case 'cancelada':
      return 'Cancelada';
    default:
      return status;
  }
};

const AuditHistoryPage = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AuditHistoryItem[]>([]);
  const [summary, setSummary] = useState<AuditHistorySummary>({
    total: 0,
    concluidas: 0,
    reabertas: 0,
    canceladas: 0
  });
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsData, setDetailsData] = useState<AuditDetailResponse | null>(null);

  const effectiveFilters = useMemo(() => {
    return {
      status: filters.status === 'todos' ? undefined : filters.status,
      tipoConversa: filters.tipoConversa === 'todos' ? undefined : filters.tipoConversa,
      hasObs: filters.hasObs === 'com'
        ? true
        : filters.hasObs === 'sem'
          ? false
          : undefined,
      dtStart: filters.dtStart ? new Date(filters.dtStart).toISOString() : undefined,
      dtEnd: filters.dtEnd ? new Date(filters.dtEnd).toISOString() : undefined,
      usuarioId: filters.usuarioId ? Number(filters.usuarioId) : undefined,
      conversaId: filters.conversaId ? Number(filters.conversaId) : undefined,
      nomeConversa: filters.nomeConversa || undefined,
      qtdMin: filters.qtdMin ? Number(filters.qtdMin) : undefined,
      page,
      pageSize: PAGE_SIZE
    };
  }, [filters, page]);

  useEffect(() => {
    setPage(1);
  }, [
    filters.status,
    filters.tipoConversa,
    filters.hasObs,
    filters.dtStart,
    filters.dtEnd,
    filters.usuarioId,
    filters.conversaId,
    filters.nomeConversa,
    filters.qtdMin
  ]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await fetchAuditHistory(effectiveFilters);
        if (cancelled) return;
        setItems(result.items);
        setPagination(result.pagination);
        setSummary(result.summary);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar histórico de auditorias');
        setItems([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [effectiveFilters]);

  const totalPages = useMemo(() => {
    if (!pagination?.total) return 1;
    return Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  }, [pagination]);

  const handleFilterChange = useCallback((field: keyof FiltersState, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  const openDetails = useCallback(async (auditoriaId: number) => {
    try {
      setDetailsOpen(true);
      setDetailsLoading(true);
      setDetailsData(null);
      const data = await fetchAuditDetails(auditoriaId);
      setDetailsData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar detalhes da auditoria');
      setDetailsOpen(false);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  const handleReopen = useCallback(async (auditoriaId: number) => {
    const confirmed = window.confirm('Confirmar reabertura desta auditoria?');
    if (!confirmed) return;

    try {
      const reopenedAudit = await reopenAudit(auditoriaId);
      // Refresh list to keep histórico atualizado
      const result = await fetchAuditHistory(effectiveFilters);
      setItems(result.items);
      setPagination(result.pagination);
      setSummary(result.summary);

      const fallbackItem = result.items.find((item) => item.conversaId === reopenedAudit.conversaId);
      const chatId = reopenedAudit.conversa?.chatId || fallbackItem?.conversa?.chatId || null;

      if (chatId) {
        const params = new URLSearchParams({
          auditoriaReaberta: String(reopenedAudit.id)
        });

        navigate(
          `/groups/${encodeURIComponent(chatId)}?${params.toString()}`,
          {
            state: {
              reabertura: {
                auditoriaId: reopenedAudit.id,
                conversaId: reopenedAudit.conversaId
              }
            }
          }
        );
        return;
      }

      setSuccessMessage('Auditoria reaberta com sucesso. Acesse a aba Conversas para continuar.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível reabrir a auditoria');
    }
  }, [effectiveFilters, navigate]);

  return (
    <div className="flex h-screen w-full justify-center bg-wa-bg transition-colors">
      <div className="flex h-full w-full max-w-[1400px] flex-col overflow-hidden bg-wa-panel text-wa-text-primary transition-colors">
        <Header />
        <div className="flex-1 overflow-hidden bg-wa-bg">
          <div className="flex h-full flex-col">
            <DetailsModal
              open={detailsOpen}
              data={detailsData}
              loading={detailsLoading}
              onClose={() => setDetailsOpen(false)}
            />

            <div className="border-b border-wa-border px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-semibold text-wa-text-primary">Histórico de auditorias</h1>
                  <p className="text-sm text-wa-text-secondary">
                    Consulte auditorias concluídas ou reabertas, filtre por responsável, período e status.
                  </p>
                </div>
              </div>
            </div>

            <form
              className="border-b border-wa-border bg-wa-panel-header/50 px-6 py-4 text-sm text-wa-text-secondary"
              onSubmit={(event) => event.preventDefault()}
            >
        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide">
            Status
            <select
              value={filters.status}
              onChange={(event) => handleFilterChange('status', event.target.value as FiltersState['status'])}
              className="rounded border border-wa-border bg-wa-panel px-3 py-2 text-sm text-wa-text-primary outline-none focus:border-wa-primary"
            >
              <option value="todos">Todos</option>
              <option value="concluida">Concluída</option>
              <option value="reaberta">Reaberta</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide">
            Tipo de conversa
            <select
              value={filters.tipoConversa}
              onChange={(event) => handleFilterChange('tipoConversa', event.target.value as FiltersState['tipoConversa'])}
              className="rounded border border-wa-border bg-wa-panel px-3 py-2 text-sm text-wa-text-primary outline-none focus:border-wa-primary"
            >
              <option value="todos">Todos</option>
              <option value="grupo">Grupo</option>
              <option value="individual">Contato</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide">
            Observação
            <select
              value={filters.hasObs}
              onChange={(event) => handleFilterChange('hasObs', event.target.value as FiltersState['hasObs'])}
              className="rounded border border-wa-border bg-wa-panel px-3 py-2 text-sm text-wa-text-primary outline-none focus:border-wa-primary"
            >
              <option value="todos">Todos</option>
              <option value="com">Com observação</option>
              <option value="sem">Sem observação</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide">
            Data inicial
            <input
              type="datetime-local"
              value={filters.dtStart}
              onChange={(event) => handleFilterChange('dtStart', event.target.value)}
              className="rounded border border-wa-border bg-wa-panel px-3 py-2 text-sm text-wa-text-primary outline-none focus:border-wa-primary"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide">
            Data final
            <input
              type="datetime-local"
              value={filters.dtEnd}
              onChange={(event) => handleFilterChange('dtEnd', event.target.value)}
              className="rounded border border-wa-border bg-wa-panel px-3 py-2 text-sm text-wa-text-primary outline-none focus:border-wa-primary"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide">
            ID do usuário
            <input
              type="number"
              min="0"
              value={filters.usuarioId}
              onChange={(event) => handleFilterChange('usuarioId', event.target.value)}
              className="rounded border border-wa-border bg-wa-panel px-3 py-2 text-sm text-wa-text-primary outline-none focus:border-wa-primary"
              placeholder="Ex: 12"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide">
            ID da conversa
            <input
              type="number"
              min="0"
              value={filters.conversaId}
              onChange={(event) => handleFilterChange('conversaId', event.target.value)}
              className="rounded border border-wa-border bg-wa-panel px-3 py-2 text-sm text-wa-text-primary outline-none focus:border-wa-primary"
              placeholder="Ex: 214"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide">
            Nome/conversa
            <input
              type="text"
              value={filters.nomeConversa}
              onChange={(event) => handleFilterChange('nomeConversa', event.target.value)}
              className="rounded border border-wa-border bg-wa-panel px-3 py-2 text-sm text-wa-text-primary outline-none focus:border-wa-primary"
              placeholder="Buscar por nome"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide">
            Quantidade mínima
            <input
              type="number"
              min="0"
              value={filters.qtdMin}
              onChange={(event) => handleFilterChange('qtdMin', event.target.value)}
              className="rounded border border-wa-border bg-wa-panel px-3 py-2 text-sm text-wa-text-primary outline-none focus:border-wa-primary"
              placeholder="Ex: 10"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center justify-end">
          <button
            type="button"
            onClick={handleResetFilters}
            className="rounded border border-wa-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-wa-text-secondary transition-colors hover:border-wa-primary hover:text-wa-text-primary"
          >
            Limpar filtros
          </button>
        </div>
      </form>

      {successMessage && (
        <div className="mx-6 mt-4 rounded border border-wa-system-green/40 bg-wa-system-green/10 px-4 py-3 text-sm text-wa-system-green">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="mx-6 mt-4 rounded border border-wa-system-red/50 bg-wa-system-red/10 px-4 py-3 text-sm text-wa-system-red">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto px-6 py-6">
        {loading && items.length === 0 && (
          <div className="flex h-40 items-center justify-center text-wa-text-secondary">
            Carregando auditorias...
          </div>
        )}

        {!loading && items.length === 0 && !error && (
          <div className="flex h-40 items-center justify-center text-wa-text-secondary">
            Nenhum resultado encontrado com os filtros atuais.
          </div>
        )}

        {items.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-wa-border">
            <table className="min-w-full divide-y divide-wa-border">
              <thead className="bg-wa-panel-header/60 text-xs uppercase text-wa-text-secondary">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Conversa</th>
                  <th className="px-4 py-3 text-left font-semibold">Período</th>
                  <th className="px-4 py-3 text-left font-semibold">Usuário</th>
                  <th className="px-4 py-3 text-left font-semibold">Qtd</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-wa-border bg-wa-panel">
                {items.map((item) => (
                  <tr key={item.id} className="text-sm text-wa-text-secondary hover:bg-wa-panel-header/40">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-wa-text-primary">
                          {item.conversa?.nome || item.conversa?.chatId || `#${item.conversaId}`}
                        </span>
                        <span className="text-xs text-wa-text-secondary/70">
                          ID conversa: {item.conversaId}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col text-wa-text-secondary">
                        <span>{item.dataInicio ? new Date(item.dataInicio).toLocaleString('pt-BR') : '—'}</span>
                        <span>{item.dataFim ? new Date(item.dataFim).toLocaleString('pt-BR') : '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-wa-text-secondary">
                      <div className="flex flex-col">
                        <span>{item.usuario?.nome || item.usuarioId}</span>
                        {item.usuario?.email && (
                          <span className="text-xs text-wa-text-secondary/70">{item.usuario.email}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-wa-text-primary font-semibold">
                      {item.qtdMensagens}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                        item.status === 'concluida'
                          ? 'bg-wa-system-green/20 text-wa-system-green'
                          : item.status === 'reaberta'
                            ? 'bg-wa-system-yellow/20 text-wa-system-yellow'
                            : 'bg-wa-system-red/20 text-wa-system-red'
                      }`}
                      >
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openDetails(item.id)}
                          className="rounded border border-wa-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-wa-text-secondary transition-colors hover:border-wa-primary hover:text-wa-text-primary"
                        >
                          Ver detalhes
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReopen(item.id)}
                          className="rounded border border-wa-system-yellow px-3 py-1 text-xs font-semibold uppercase tracking-wide text-wa-system-yellow transition-colors hover:bg-wa-system-yellow/10"
                        >
                          Reabrir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

            <div className="border-t border-wa-border px-6 py-4 text-xs text-wa-text-secondary">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-4">
                  <span>Total: <strong className="text-wa-text-primary">{summary.total}</strong></span>
                  <span>Concluídas: <strong className="text-wa-system-green">{summary.concluidas}</strong></span>
                  <span>Reabertas: <strong className="text-wa-system-yellow">{summary.reabertas}</strong></span>
                  <span>Canceladas: <strong className="text-wa-system-red">{summary.canceladas}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page === 1 || loading}
                    className="rounded border border-wa-border px-3 py-2 font-semibold uppercase tracking-wide transition-colors hover:border-wa-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <span>
                    Página {page} de {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((current) => (current < totalPages ? current + 1 : current))}
                    disabled={page >= totalPages || loading}
                    className="rounded border border-wa-border px-3 py-2 font-semibold uppercase tracking-wide transition-colors hover:border-wa-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditHistoryPage;
