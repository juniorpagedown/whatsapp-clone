import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  ClassificacaoCatalogoItem,
  ClassificacaoPayload,
  ImportClassificacaoReportLine,
  deleteClassificacao,
  exportClassificacoesUrl,
  importClassificacoes,
  listClassificacoes,
  toggleClassificacao,
  createClassificacao,
  updateClassificacao
} from '../services/classificationApi.ts';
import Header from '../components/Header.jsx';

const PAGE_SIZE = 20;

type StatusFilter = 'true' | 'false' | 'all' | 'deleted';

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: 'true', label: 'Ativos' },
  { value: 'false', label: 'Inativos' },
  { value: 'all', label: 'Todos' },
  { value: 'deleted', label: 'Deletados' }
];

type FormMode = 'create' | 'edit';

type ClassificacaoFormResult = {
  macro: string;
  item: string;
  descricao: string | null;
  cor_hex: string | null;
  prioridade: number;
  ativo: boolean;
};

const COLOR_HEX_REGEX = /^#([0-9A-Fa-f]{6})$/;
const PRIORIDADE_MIN = -999;
const PRIORIDADE_MAX = 999;

const toSlugFragment = (value: string) => {
  if (!value) {
    return '';
  }

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
};

const buildSlugPreview = (macro: string, item: string) => {
  const macroSlug = toSlugFragment(macro);
  const itemSlug = toSlugFragment(item);
  return [macroSlug, itemSlug].filter(Boolean).join('-');
};

const buildReportMessage = (report: ImportClassificacaoReportLine[]) => {
  if (!report.length) {
    return 'Nenhuma linha processada.';
  }

  const summary = report.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { created: 0, updated: 0, error: 0 }
  );

  const messageLines = [
    `Importação concluída. Criados: ${summary.created}, Atualizados: ${summary.updated}, Erros: ${summary.error}`
  ];

  const errors = report.filter((item) => item.status === 'error');
  if (errors.length) {
    messageLines.push('\nLinhas com erro:');
    errors.slice(0, 5).forEach((item) => {
      const label = item.line ? `Linha ${item.line}` : 'Linha desconhecida';
      messageLines.push(`${label}: ${item.error ?? 'Erro desconhecido'}`);
    });
    if (errors.length > 5) {
      messageLines.push('...');
    }
  }

  return messageLines.join('\n');
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('pt-BR');
};

const AdminClassificacoesPage: React.FC = () => {
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('true');
  const [filters, setFilters] = useState<{ q: string; ativo: StatusFilter }>({ q: '', ativo: 'true' });
  const [items, setItems] = useState<ClassificacaoCatalogoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('prioridade:asc,macro:asc,item:asc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [formState, setFormState] = useState<{ mode: FormMode; item: ClassificacaoCatalogoItem | null } | null>(null);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }, [total]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listClassificacoes({
        q: filters.q,
        ativo: filters.ativo,
        page,
        pageSize: PAGE_SIZE,
        sort
      });
      setItems(response.data);
      setTotal(response.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar classificações';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [filters, page, sort]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const applyFilters = useCallback(() => {
    setFilters({ q: searchInput.trim(), ativo: statusFilter });
    setPage(1);
  }, [searchInput, statusFilter]);

  const handleSubmitFilters = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    applyFilters();
  }, [applyFilters]);

  const handleChangeStatus = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(event.target.value as StatusFilter);
  }, []);

  const handleCreate = useCallback(() => {
    setFormState({ mode: 'create', item: null });
  }, []);

  const handleEdit = useCallback((item: ClassificacaoCatalogoItem) => {
    setFormState({ mode: 'edit', item });
  }, []);

  const handleCloseForm = useCallback(() => {
    setFormState(null);
  }, []);

  const handleSubmitForm = useCallback(
    async (mode: FormMode, currentItem: ClassificacaoCatalogoItem | null, values: ClassificacaoFormResult) => {
      const trimmedMacro = values.macro.trim();
      const trimmedItem = values.item.trim();

      const basePayload: ClassificacaoPayload = {
        macro: trimmedMacro,
        item: trimmedItem,
        prioridade: values.prioridade,
        ativo: values.ativo
      };

      const createPayload: ClassificacaoPayload = {
        ...basePayload,
        ...(values.descricao !== null ? { descricao: values.descricao } : {}),
        ...(values.cor_hex ? { cor_hex: values.cor_hex } : {})
      };

      const updatePayload: ClassificacaoPayload = {
        ...basePayload,
        descricao: values.descricao,
        ...(values.cor_hex !== null ? { cor_hex: values.cor_hex } : { cor_hex: null })
      };

      try {
        if (mode === 'create') {
          await createClassificacao(createPayload);
          window.alert('Classificação criada com sucesso.');
        } else if (currentItem) {
          await updateClassificacao(currentItem.id, updatePayload);
          window.alert('Classificação atualizada com sucesso.');
        }
        await refresh().catch(() => {});
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Não foi possível salvar a classificação';
        window.alert(message);
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [refresh]
  );

  const handleToggle = useCallback(async (item: ClassificacaoCatalogoItem) => {
    try {
      await toggleClassificacao(item.id);
      refresh().catch(() => {});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível alterar o status';
      window.alert(message);
    }
  }, [refresh]);

  const handleDelete = useCallback(async (item: ClassificacaoCatalogoItem) => {
    const confirmed = window.confirm(`Deseja remover "${item.macro} / ${item.item}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteClassificacao(item.id);
      refresh().catch(() => {});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao remover classificação';
      window.alert(message);
    }
  }, [refresh]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const report = await importClassificacoes(file);
      window.alert(buildReportMessage(report));
      refresh().catch(() => {});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao importar CSV';
      window.alert(message);
    } finally {
      event.target.value = '';
    }
  }, [refresh]);

  const handleChangeSort = useCallback(() => {
    setSort((prev) => {
      if (prev.startsWith('prioridade:desc')) {
        return 'prioridade:asc,macro:asc,item:asc';
      }
      return 'prioridade:desc,macro:asc,item:asc';
    });
  }, []);

  const handleChangePage = useCallback((nextPage: number) => {
    setPage(Math.max(1, Math.min(nextPage, Math.max(1, totalPages))));
  }, [totalPages]);

  const exportUrl = useMemo(() => exportClassificacoesUrl(), []);

  return (
    <div className="flex h-screen w-full justify-center bg-wa-bg transition-colors">
      <div className="flex h-full w-full max-w-[1400px] flex-col overflow-hidden bg-wa-panel text-wa-text-primary transition-colors">
        <Header />
        <div className="flex-1 overflow-auto bg-wa-bg px-6 py-6 transition-colors">
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col gap-3">
                <div>
                  <h1 className="text-2xl font-semibold text-wa-text-primary">Classificações</h1>
                  <p className="text-sm text-wa-text-secondary">
                    Gerencie o catálogo de classificações utilizadas pelo atendimento.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handleImportClick}
                  className="rounded-lg border border-wa-border bg-wa-panel px-3 py-2 text-sm font-medium text-wa-text-secondary transition-colors hover:bg-wa-panel-header hover:text-wa-text-primary"
                >
                  Importar CSV
                </button>
                <a
                  href={exportUrl}
                  className="rounded-lg border border-wa-border bg-wa-panel px-3 py-2 text-sm font-medium text-wa-text-secondary transition-colors hover:bg-wa-panel-header hover:text-wa-text-primary"
                >
                  Exportar CSV
                </a>
                <button
                  type="button"
                  onClick={handleCreate}
                  className="rounded-lg bg-wa-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-wa-primary/90"
                >
                  Nova
                </button>
              </div>
            </div>

            <form
              onSubmit={handleSubmitFilters}
              className="flex flex-col gap-3 rounded-lg border border-wa-border bg-wa-panel px-4 py-4 shadow-sm transition-colors sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  placeholder="Buscar por macro, item, slug..."
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  className="w-full rounded-lg border border-wa-border bg-wa-panel-header px-3 py-2 text-sm text-wa-text-primary transition focus:border-wa-primary focus:outline-none focus:ring-1 focus:ring-wa-primary"
                />
                <select
                  value={statusFilter}
                  onChange={handleChangeStatus}
                  className="w-full rounded-lg border border-wa-border bg-wa-panel-header px-3 py-2 text-sm text-wa-text-primary transition focus:border-wa-primary focus:outline-none focus:ring-1 focus:ring-wa-primary sm:w-48"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg border border-wa-border bg-wa-panel px-4 py-2 text-sm font-medium text-wa-text-primary transition hover:bg-wa-panel-header"
                >
                  Aplicar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setStatusFilter('true');
                    setFilters({ q: '', ativo: 'true' });
                    setPage(1);
                  }}
                  className="rounded-lg border border-wa-border bg-wa-panel px-4 py-2 text-sm font-medium text-wa-text-secondary transition hover:bg-wa-panel-header hover:text-wa-text-primary"
                >
                  Limpar
                </button>
              </div>
            </form>

            <div className="overflow-hidden rounded-lg border border-wa-border bg-wa-panel shadow-sm transition-colors">
              <table className="min-w-full divide-y divide-wa-border">
                <thead className="bg-wa-panel-header text-xs font-semibold uppercase tracking-wide text-wa-text-secondary">
                  <tr className="text-left">
                    <th className="px-4 py-3">Macro</th>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Slug</th>
                    <th className="px-4 py-3">Cor</th>
                    <th
                      className="px-4 py-3 cursor-pointer select-none"
                      onClick={handleChangeSort}
                    >
                      Prioridade
                    </th>
                    <th className="px-4 py-3">Ativo</th>
                    <th className="px-4 py-3">Atualizado</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-wa-border text-sm">
                  {loading && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-wa-text-secondary">
                        Carregando classificações...
                      </td>
                    </tr>
                  )}

                  {!loading && items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-wa-text-secondary">
                        Nenhuma classificação encontrada.
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    items.map((item) => (
                      <tr key={item.id} className="transition-colors hover:bg-wa-panel-header/70">
                        <td className="px-4 py-3 font-medium text-wa-text-primary">{item.macro}</td>
                        <td className="px-4 py-3 text-wa-text-primary">{item.item}</td>
                        <td className="px-4 py-3 text-wa-text-secondary">{item.slug}</td>
                        <td className="px-4 py-3">
                          {item.cor_hex ? (
                            <span className="inline-flex items-center gap-2 text-wa-text-secondary">
                              <span
                                className="h-4 w-4 rounded border border-wa-border/60"
                                style={{ backgroundColor: item.cor_hex }}
                              />
                              {item.cor_hex}
                            </span>
                          ) : (
                            <span className="text-wa-text-secondary">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-wa-text-primary">{item.prioridade}</td>
                        <td className="px-4 py-3">
                          {item.deleted_at ? (
                            <span className="rounded-full bg-wa-system-red/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-wa-system-red">
                              Deletado
                            </span>
                          ) : item.ativo ? (
                            <span className="rounded-full bg-wa-system-green/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-wa-system-green">
                              Ativo
                            </span>
                          ) : (
                            <span className="rounded-full bg-wa-system-yellow/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-wa-system-yellow">
                              Inativo
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-wa-text-secondary">
                          {formatDateTime(item.updated_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleEdit(item)}
                              className="rounded border border-wa-border px-3 py-1 text-xs font-medium text-wa-text-primary transition hover:bg-wa-panel-header"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggle(item)}
                              className="rounded border border-wa-border px-3 py-1 text-xs font-medium text-wa-text-secondary transition hover:bg-wa-panel-header hover:text-wa-text-primary"
                            >
                              {item.ativo ? 'Desativar' : 'Ativar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              className="rounded border border-wa-system-red/60 px-3 py-1 text-xs font-medium text-wa-system-red transition hover:bg-wa-system-red/10"
                            >
                              Deletar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {error && (
              <div className="rounded border border-wa-system-red/60 bg-wa-system-red/10 px-4 py-3 text-sm text-wa-system-red">
                {error}
              </div>
            )}

            <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
              <div className="text-sm text-wa-text-secondary">
                Página {page} de {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleChangePage(page - 1)}
                  disabled={page <= 1}
                  className="rounded border border-wa-border bg-wa-panel px-3 py-2 text-sm font-medium text-wa-text-secondary transition hover:bg-wa-panel-header disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => handleChangePage(page + 1)}
                  disabled={page >= totalPages}
                  className="rounded border border-wa-border bg-wa-panel px-3 py-2 text-sm font-medium text-wa-text-secondary transition hover:bg-wa-panel-header disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
        </div>
      </div>
    </div>
      {formState && (
        <ClassificacaoFormModal
          mode={formState.mode}
          item={formState.item}
          onClose={handleCloseForm}
          onSubmit={(values) => handleSubmitForm(formState.mode, formState.item, values)}
        />
      )}
  </div>
);
};

type ClassificacaoFormModalProps = {
  mode: FormMode;
  item: ClassificacaoCatalogoItem | null;
  onClose: () => void;
  onSubmit: (values: ClassificacaoFormResult) => Promise<void>;
};

type FormFields = {
  macro: string;
  item: string;
  descricao: string;
  cor_hex: string;
  prioridade: string;
  ativo: boolean;
};

const buildInitialFormValues = (mode: FormMode, item: ClassificacaoCatalogoItem | null): FormFields => {
  if (mode === 'edit' && item) {
    return {
      macro: item.macro ?? '',
      item: item.item ?? '',
      descricao: item.descricao ?? '',
      cor_hex: item.cor_hex ?? '',
      prioridade: Number.isFinite(item.prioridade) ? String(item.prioridade) : '0',
      ativo: item.deleted_at ? false : item.ativo
    };
  }

  return {
    macro: '',
    item: '',
    descricao: '',
    cor_hex: '',
    prioridade: '0',
    ativo: true
  };
};

const ClassificacaoFormModal: React.FC<ClassificacaoFormModalProps> = ({
  mode,
  item,
  onClose,
  onSubmit
}) => {
  const [values, setValues] = useState<FormFields>(() => buildInitialFormValues(mode, item));
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const macroInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setValues(buildInitialFormValues(mode, item));
    setErrorMessage(null);
  }, [mode, item]);

  useEffect(() => {
    if (macroInputRef.current) {
      macroInputRef.current.focus();
      macroInputRef.current.select();
    }
  }, [mode, item]);

  useEffect(() => {
    const keyHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [onClose]);

  useEffect(() => {
    if (!copyFeedback) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCopyFeedback(null);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [copyFeedback]);

  const slugPreview = useMemo(() => {
    if (mode === 'edit') {
      return item?.slug ?? '';
    }
    return buildSlugPreview(values.macro, values.item);
  }, [mode, item, values.macro, values.item]);

  const title = mode === 'create' ? 'Nova classificação' : 'Editar classificação';

  const handleFieldChange = useCallback(
    (field: keyof FormFields) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { value } = event.target;
      setValues((prev) => ({
        ...prev,
        [field]: value
      }));
    },
    []
  );

  const handleToggleAtivo = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const { checked } = event.target;
    setValues((prev) => ({
      ...prev,
      ativo: checked
    }));
  }, []);

  const handleCopySlug = useCallback(async () => {
    if (!slugPreview) {
      return;
    }

    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(slugPreview);
        setCopyFeedback('Slug copiado');
      } catch (err) {
        console.warn('Não foi possível copiar o slug', err);
        setCopyFeedback('Falha ao copiar');
      }
    } else {
      setCopyFeedback('Copie manualmente');
    }
  }, [slugPreview]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setErrorMessage(null);

      const macro = values.macro.trim();
      if (!macro) {
        setErrorMessage('Informe a macro da classificação.');
        return;
      }

      const itemValue = values.item.trim();
      if (!itemValue) {
        setErrorMessage('Informe o item da classificação.');
        return;
      }

      const descricaoTrimmed = values.descricao.trim();
      const descricao = descricaoTrimmed.length ? descricaoTrimmed : null;

      const corInput = values.cor_hex.trim();
      let corHex: string | null = null;
      if (corInput.length) {
        if (!COLOR_HEX_REGEX.test(corInput)) {
          setErrorMessage('Informe a cor no formato hexadecimal #RRGGBB.');
          return;
        }
        corHex = corInput.toLowerCase();
      } else if (mode === 'edit' && item?.cor_hex) {
        // Se o usuário apaga o campo em modo edição queremos limpar o valor
        corHex = null;
      }

      const prioridadeValue = values.prioridade.trim().length ? values.prioridade.trim() : '0';
      let prioridade = Number(prioridadeValue);
      if (!Number.isFinite(prioridade)) {
        setErrorMessage('Informe uma prioridade numérica.');
        return;
      }
      prioridade = Math.trunc(prioridade);
      if (prioridade < PRIORIDADE_MIN || prioridade > PRIORIDADE_MAX) {
        setErrorMessage(`Prioridade deve estar entre ${PRIORIDADE_MIN} e ${PRIORIDADE_MAX}.`);
        return;
      }

      const payload: ClassificacaoFormResult = {
        macro,
        item: itemValue,
        descricao,
        cor_hex: corHex,
        prioridade,
        ativo: values.ativo
      };

      setSaving(true);
      try {
        await onSubmit(payload);
        onClose();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível salvar a classificação.';
        setErrorMessage(message);
      } finally {
        setSaving(false);
      }
    },
    [item, mode, onSubmit, values.ativo, values.cor_hex, values.descricao, values.item, values.macro, values.prioridade]
  );

  const slugHelperText =
    mode === 'create' && !slugPreview
      ? 'O slug será gerado automaticamente ao salvar.'
      : 'Identificador único usado em integrações e buscas.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
      <div
        className="absolute inset-0"
        onClick={() => {
          if (!saving) {
            onClose();
          }
        }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="classificacao-form-title"
        className="relative z-10 w-full max-w-xl rounded-2xl border border-wa-border bg-wa-panel shadow-xl transition-colors"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="classificacao-form-title" className="text-lg font-semibold text-wa-text-primary">
                {title}
              </h2>
              <p className="text-sm text-wa-text-secondary">
                Preencha os campos para {mode === 'create' ? 'criar' : 'atualizar'} a classificação.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-wa-text-secondary transition hover:bg-wa-panel-header hover:text-wa-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              disabled={saving}
              aria-label="Fechar"
            >
              ×
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-wa-text-secondary">
              Macro
              <input
                ref={macroInputRef}
                id="classificacao-macro"
                name="macro"
                type="text"
                value={values.macro}
                onChange={handleFieldChange('macro')}
                className="rounded-lg border border-wa-border bg-wa-panel-header px-3 py-2 text-wa-text-primary transition focus:border-wa-primary focus:outline-none focus:ring-1 focus:ring-wa-primary"
                placeholder="Ex: Financeiro"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-wa-text-secondary">
              Item
              <input
                id="classificacao-item"
                name="item"
                type="text"
                value={values.item}
                onChange={handleFieldChange('item')}
                className="rounded-lg border border-wa-border bg-wa-panel-header px-3 py-2 text-wa-text-primary transition focus:border-wa-primary focus:outline-none focus:ring-1 focus:ring-wa-primary"
                placeholder="Ex: Chargeback"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-wa-text-secondary">
              Slug
              <div className="flex items-center gap-2">
                <input
                  id="classificacao-slug"
                  name="slug"
                  type="text"
                  value={slugPreview || (mode === 'edit' ? item?.slug ?? '' : '')}
                  readOnly
                  className="flex-1 rounded-lg border border-wa-border bg-wa-panel-header px-3 py-2 text-wa-text-secondary transition focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopySlug}
                  disabled={!slugPreview}
                  className="rounded-lg border border-wa-border px-3 py-2 text-sm font-medium text-wa-text-secondary transition hover:bg-wa-panel-header disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Copiar
                </button>
              </div>
              <span className="text-xs text-wa-text-tertiary">
                {copyFeedback ?? slugHelperText}
              </span>
            </label>
            <label className="flex flex-col gap-2 text-sm text-wa-text-secondary">
              Prioridade (-999 a 999)
              <input
                id="classificacao-prioridade"
                name="prioridade"
                type="number"
                value={values.prioridade}
                onChange={handleFieldChange('prioridade')}
                className="rounded-lg border border-wa-border bg-wa-panel-header px-3 py-2 text-wa-text-primary transition focus:border-wa-primary focus:outline-none focus:ring-1 focus:ring-wa-primary"
              />
            </label>
          </div>

          <label className="flex flex-col gap-2 text-sm text-wa-text-secondary">
            Descrição
            <textarea
              id="classificacao-descricao"
              name="descricao"
              value={values.descricao}
              onChange={handleFieldChange('descricao')}
              rows={3}
              className="rounded-lg border border-wa-border bg-wa-panel-header px-3 py-2 text-wa-text-primary transition focus:border-wa-primary focus:outline-none focus:ring-1 focus:ring-wa-primary"
              placeholder="Detalhes adicionais sobre a classificação"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-wa-text-secondary">
              Cor (hexadecimal)
              <input
                id="classificacao-cor"
                name="cor"
                type="text"
                value={values.cor_hex}
                onChange={handleFieldChange('cor_hex')}
                className="rounded-lg border border-wa-border bg-wa-panel-header px-3 py-2 text-wa-text-primary transition focus:border-wa-primary focus:outline-none focus:ring-1 focus:ring-wa-primary"
                placeholder="#22c55e"
              />
            </label>
            <label className="flex items-center gap-3 text-sm text-wa-text-secondary">
              <input
                id="classificacao-ativo"
                name="ativo"
                type="checkbox"
                checked={values.ativo}
                onChange={handleToggleAtivo}
                className="h-4 w-4 rounded border-wa-border bg-wa-panel-header text-wa-primary focus:ring-wa-primary"
              />
              Ativo
            </label>
          </div>

          {errorMessage && (
            <div className="rounded border border-wa-system-red/60 bg-wa-system-red/10 px-3 py-2 text-sm text-wa-system-red">
              {errorMessage}
            </div>
          )}

          <div className="flex flex-col justify-end gap-3 pt-2 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-wa-border px-4 py-2 text-sm font-medium text-wa-text-secondary transition hover:bg-wa-panel-header disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-wa-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-wa-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminClassificacoesPage;
