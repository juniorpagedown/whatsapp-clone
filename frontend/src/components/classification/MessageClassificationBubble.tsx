import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type { ClassificationCatalog } from '../../services/classificationApi';
import {
  fetchCatalog,
  fetchMessageClassification,
  upsertMessageClassification
} from '../../services/classificationApi';
import ClassificationBadge from './ClassificationBadge';

type MessageClassificationBubbleProps = {
  messageId: number | string | null | undefined;
  conversaId: number | string | null | undefined;
  anchor?: 'left' | 'right';
  initiallyOpen?: boolean;
  onInitialOpen?: () => void;
};

const defaultCatalog: ClassificationCatalog = {
  macros: [],
  itens: {}
};

type StatusState =
  | 'loading'
  | 'unclassified'
  | 'classified'
  | 'pending'
  | 'saving'
  | 'error';

type LastSaved = {
  macro: string;
  item: string;
} | null;

const catalogCache: {
  data: ClassificationCatalog | null;
  promise: Promise<ClassificationCatalog> | null;
} = {
  data: null,
  promise: null
};

const ensureCatalog = async (): Promise<ClassificationCatalog> => {
  if (catalogCache.data) {
    return catalogCache.data;
  }

  if (!catalogCache.promise) {
    catalogCache.promise = fetchCatalog()
      .then((data) => {
        catalogCache.data = data;
        return data;
      })
      .catch((error) => {
        catalogCache.promise = null;
        throw error;
      });
  }

  return catalogCache.promise;
};

const MessageClassificationBubble: React.FC<MessageClassificationBubbleProps> = ({
  messageId,
  conversaId,
  anchor = 'right',
  initiallyOpen = false,
  onInitialOpen
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [catalog, setCatalog] = useState<ClassificationCatalog>(catalogCache.data ?? defaultCatalog);
  const [macro, setMacro] = useState('');
  const [item, setItem] = useState('');
  const [status, setStatus] = useState<StatusState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [dirty, setDirty] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const lastSavedRef = useRef<LastSaved>(null);
  const initialOpenHandledRef = useRef(false);

  const parseNumericId = (value: number | string | null | undefined) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    return null;
  };

  const messageIdNumber = parseNumericId(messageId);
  const conversaIdNumber = parseNumericId(conversaId);

  useEffect(() => {
    if (
      !initiallyOpen ||
      initialOpenHandledRef.current ||
      !messageIdNumber ||
      !conversaIdNumber
    ) {
      return;
    }

    setIsOpen(true);
    initialOpenHandledRef.current = true;
    onInitialOpen?.();
  }, [conversaIdNumber, initiallyOpen, messageIdNumber, onInitialOpen]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const resetFields = useCallback(() => {
    setMacro('');
    setItem('');
    lastSavedRef.current = null;
  }, []);

  const loadClassification = useCallback(async () => {
    if (!messageIdNumber) {
      resetFields();
      setStatus('unclassified');
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const record = await fetchMessageClassification(messageIdNumber);
      if (!mountedRef.current) return;

      if (record) {
        setMacro(record.macro);
        setItem(record.item);
        lastSavedRef.current = {
          macro: record.macro,
          item: record.item
        };
        setStatus('classified');
      } else {
        resetFields();
        setStatus('unclassified');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Não foi possível carregar a classificação';
      setError(message);
      setStatus('error');
    }
  }, [messageIdNumber, resetFields]);

  useEffect(() => {
    loadClassification();
  }, [loadClassification]);

useEffect(() => {
  if (!isOpen) {
    return;
  }

  if (catalogCache.data) {
    if (catalog.macros.length === 0) {
      setCatalog(catalogCache.data);
    }
    return;
  }

  let cancelled = false;
  setLoadingCatalog(true);

  ensureCatalog()
    .then((data) => {
      if (cancelled || !mountedRef.current) return;
      setCatalog(data);
    })
    .catch((err) => {
      if (cancelled || !mountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Não foi possível carregar o catálogo';
      setError(message);
    })
    .finally(() => {
      if (!cancelled && mountedRef.current) {
        setLoadingCatalog(false);
      }
    });

  return () => {
    cancelled = true;
  };
}, [catalog.macros.length, isOpen]);

  const availableItems = useMemo(() => {
    if (!macro) return [];
    return catalog.itens[macro] || [];
  }, [catalog.itens, macro]);

  const statusLabel = useMemo(() => {
    if (status === 'loading') return 'Carregando…';
    if (status === 'saving') return 'Salvando…';
    if (status === 'error') return error || 'Erro';
    if (status === 'pending') return 'Pendente';
    if (status === 'classified') return 'Classificado';
    return 'Não classificado';
  }, [status, error]);

  const computeDirtyState = useCallback((nextMacro: string, nextItem: string) => {
    const saved = lastSavedRef.current;

    if (!nextMacro || !nextItem) {
      setDirty(false);
      setStatus('unclassified');
      return;
    }

    if (saved && saved.macro === nextMacro && saved.item === nextItem) {
      setDirty(false);
      setStatus('classified');
    } else {
      setDirty(true);
      setStatus('pending');
    }
  }, []);

  const handleMacroChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      const items = value ? catalog.itens[value] || [] : [];
      const nextItem = items.length > 0 ? items[0] : '';
      setMacro(value);
      setItem(nextItem);
      computeDirtyState(value, nextItem);
    },
    [catalog.itens, computeDirtyState]
  );

  const handleItemChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      setItem(value);
      computeDirtyState(macro, value);
    },
    [macro, computeDirtyState]
  );

  useEffect(() => {
    if (!dirty || !macro || !item || !messageIdNumber) {
      return undefined;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    setStatus((prev) => (prev === 'error' ? 'pending' : prev));

    debounceRef.current = setTimeout(async () => {
      setStatus('saving');
      try {
        const saved = await upsertMessageClassification({
          messageId: messageIdNumber,
          conversaId: conversaIdNumber || undefined,
          macro,
          item
        });

        if (!mountedRef.current) return;

        lastSavedRef.current = {
          macro: saved.macro,
          item: saved.item
        };
        setDirty(false);
        setError(null);
        setStatus('classified');
      } catch (err) {
        if (!mountedRef.current) return;
        const message = err instanceof Error ? err.message : 'Falha ao salvar classificação';
        setError(message);
        setStatus('error');
      }
    }, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [dirty, macro, item, conversaIdNumber, messageIdNumber]);

  if (!messageIdNumber || !conversaIdNumber) {
    return null;
  }

  const toggleOpen = () => {
    if (!isOpen && catalogCache.data && catalog.macros.length === 0) {
      setCatalog(catalogCache.data);
    }

    setIsOpen((prev) => !prev);
  };

  const overlayPosition =
    anchor === 'left'
      ? 'right-full mr-4 sm:mr-6'
      : 'left-full ml-4 sm:ml-6';

  const overlayOrigin = anchor === 'left' ? 'origin-top-right' : 'origin-top-left';

  return (
    <>
      <ClassificationBadge
        onClick={toggleOpen}
        title={statusLabel}
        anchor={anchor}
        status={status}
      />

      {isOpen && (
        <div
          className={`absolute z-50 top-1/2 -translate-y-1/2 ${overlayPosition}`}
          aria-live="polite"
        >
          <div
            className={`w-72 max-w-[85vw] rounded-xl border border-wa-border bg-wa-panel shadow-xl ${overlayOrigin}`}
          >
            <div className="flex items-start justify-between border-b border-wa-border/60 bg-wa-panel-header px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-wa-text-primary">Classificar mensagem</h3>
                <p className="mt-1 text-xs text-wa-text-secondary">
                  {statusLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="ml-3 rounded-full border border-wa-border/60 bg-wa-panel px-2 py-1 text-xs text-wa-text-secondary transition hover:border-wa-border hover:text-wa-text-primary"
              >
                Fechar
              </button>
            </div>

            <div className="flex flex-col gap-3 px-4 py-4">
              {status === 'loading' || loadingCatalog ? (
                <div className="space-y-3">
                  <div className="h-4 w-1/2 animate-pulse rounded bg-wa-border/50" />
                  <div className="h-10 animate-pulse rounded bg-wa-border/40" />
                  <div className="h-10 animate-pulse rounded bg-wa-border/40" />
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <label htmlFor={`message-macro-${messageIdNumber}`} className="text-xs font-medium text-wa-text-secondary">
                      Macro
                    </label>
                    <select
                      id={`message-macro-${messageIdNumber}`}
                      value={macro}
                      onChange={handleMacroChange}
                      className="w-full rounded-lg border border-wa-border bg-wa-panel px-3 py-2 text-sm text-wa-text-primary shadow-sm outline-none transition focus:border-wa-link focus:ring-1 focus:ring-wa-link"
                    >
                      <option value="">Selecione uma macro</option>
                      {catalog.macros.map((macroName) => (
                        <option key={macroName} value={macroName}>
                          {macroName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label htmlFor={`message-item-${messageIdNumber}`} className="text-xs font-medium text-wa-text-secondary">
                      Item
                    </label>
                    <select
                      id={`message-item-${messageIdNumber}`}
                      value={item}
                      onChange={handleItemChange}
                      disabled={!macro}
                      className="w-full rounded-lg border border-wa-border bg-wa-panel px-3 py-2 text-sm text-wa-text-primary shadow-sm outline-none transition focus:border-wa-link focus:ring-1 focus:ring-wa-link disabled:cursor-not-allowed disabled:bg-wa-panel"
                    >
                      <option value="">
                        {macro ? 'Selecione um item' : 'Escolha uma macro primeiro'}
                      </option>
                      {availableItems.map((itemName) => (
                        <option key={itemName} value={itemName}>
                          {itemName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {error && status === 'error' && (
                    <div className="rounded border border-wa-system-red/60 bg-wa-system-red/10 px-3 py-2 text-xs text-wa-system-red">
                      {error}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MessageClassificationBubble;
