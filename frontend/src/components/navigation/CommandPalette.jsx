import React, { useEffect, useMemo, useState } from 'react';
import { Command } from 'lucide-react';

const CommandPalette = ({ open, onClose, items = [], onSelect }) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const handler = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return items;
    }
    return items.filter((item) => {
      const haystack = `${item.label} ${item.description || ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [items, query]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-wa-border bg-wa-panel shadow-2xl">
        <div className="flex items-center gap-2 border-b border-wa-border bg-wa-panel-header px-4 py-3 text-sm text-wa-text-secondary">
          <Command size={16} />
          <span className="font-semibold uppercase tracking-wide">Command palette</span>
          <span className="ml-auto rounded border border-wa-border bg-wa-panel px-2 py-[2px] text-[11px] font-semibold text-wa-text-secondary">
            ESC
          </span>
        </div>
        <div className="px-4 py-3">
          <input
            autoFocus
            type="text"
            className="w-full rounded-lg border border-wa-border bg-wa-panel px-3 py-2 text-sm text-wa-text-primary outline-none transition-colors focus:border-wa-primary focus:ring-2 focus:ring-wa-primary/20"
            placeholder="Digite para navegar ou acionar uma tarefa…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Filtrar itens da paleta de comandos"
          />
        </div>

        <div className="max-h-72 overflow-y-auto px-2 pb-2">
          {filteredItems.length === 0 && (
            <p className="px-4 py-6 text-sm text-wa-text-secondary">Nenhum resultado encontrado.</p>
          )}
          {filteredItems.map((item) => (
            <button
              key={`${item.type}-${item.key || item.to || item.actionId}`}
              type="button"
              onClick={() => onSelect?.(item)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm transition-colors hover:bg-wa-panel-header"
            >
              <span className="text-wa-icon">{item.icon}</span>
              <span className="flex-1">
                <span className="block font-semibold text-wa-text-primary">{item.label}</span>
                {item.description && (
                  <span className="text-xs text-wa-text-secondary">{item.description}</span>
                )}
              </span>
              {item.shortcut && (
                <span className="rounded border border-wa-border bg-wa-panel px-2 py-[2px] text-[11px] font-semibold text-wa-text-secondary">
                  {item.shortcut}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
