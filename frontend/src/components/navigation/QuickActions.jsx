import React, { useEffect, useRef, useState } from 'react';
import { Plus, Sparkles, Search, X } from 'lucide-react';

const actions = [
  {
    id: 'new-conversation',
    label: 'Nova conversa',
    description: 'Iniciar registro de atendimento manual',
    icon: <Plus size={14} />
  },
  {
    id: 'clear-search',
    label: 'Limpar filtros',
    description: 'Zera filtros de busca e destaca conversas recentes',
    icon: <X size={14} />
  },
  {
    id: 'focus-search',
    label: 'Focar busca',
    description: 'Posiciona cursor no campo de busca global',
    icon: <Search size={14} />
  }
];

const QuickActions = ({ onAction }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEsc = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEsc);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  const handleSelect = (action) => {
    onAction?.(action.id);
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-lg border border-wa-border bg-wa-panel px-3 py-2 text-sm font-medium text-wa-text-primary transition-colors hover:border-wa-primary hover:text-wa-primary"
      >
        <Sparkles size={16} className="text-wa-icon" />
        Ações rápidas
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 rounded-lg border border-wa-border bg-wa-panel p-2 shadow-lg">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-wa-text-secondary">
            Atalhos frequentes
          </p>
          <ul className="space-y-1">
            {actions.map((action) => (
              <li key={action.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(action)}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-wa-panel-header"
                >
                  <span className="mt-[2px] text-wa-icon">{action.icon}</span>
                  <span className="flex-1">
                    <span className="block font-medium text-wa-text-primary">{action.label}</span>
                    <span className="text-xs text-wa-text-secondary">{action.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default QuickActions;
