import React from 'react';
import GroupListItem from './GroupListItem.jsx';

const GroupList = ({
  groups,
  loading,
  activeChatId,
  onSelect,
  searchTerm,
  onSearchChange
}) => {
  const visibleGroups = groups.filter((group) => !group.isAuditada);

  const renderSection = (title, items) => {
    if (!items.length) {
      return null;
    }

    return (
      <div className="px-2 pb-2">
        <div className="sticky top-0 z-10 bg-wa-panel py-2 text-xs font-semibold uppercase tracking-wide text-wa-text-secondary">
          {title}
        </div>
        <div className="space-y-1">
          {items.map((group) => (
            <GroupListItem
              key={group.chatId}
              group={group}
              active={group.chatId === activeChatId}
              onClick={() => onSelect?.(group)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <aside className="flex w-[32%] min-w-[320px] max-w-[380px] flex-col border-r border-wa-border bg-wa-panel transition-colors">
      {/* Cabeçalho da Lista de Grupos */}
      <header className="flex h-[60px] items-center justify-between bg-wa-panel-header px-4 transition-colors">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-wa-bubble-in text-lg text-wa-text-primary">
            👥
          </div>
          <span className="text-base font-medium text-wa-text-primary">Conversas</span>
        </div>
      </header>

      {/* Barra de Pesquisa */}
      <div className="border-b border-wa-border px-3 pb-3 pt-3 transition-colors">
        <div className="flex items-center gap-3 rounded-lg bg-wa-panel-header px-3 py-2 text-wa-icon transition-colors">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            className="w-full bg-transparent text-sm text-wa-text-primary placeholder-wa-text-secondary outline-none"
            placeholder="Pesquisar grupos"
            value={searchTerm}
            onChange={(event) => onSearchChange?.(event.target.value)}
          />
        </div>
      </div>

      {/* Lista de Grupos */}
      <div className="flex-1 overflow-y-auto bg-wa-panel">
        {loading ? (
          // Skeleton Loader
          <div className="space-y-2 px-4 py-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`group-skeleton-${index}`}
                className="flex animate-pulse items-center gap-3 rounded-lg bg-wa-panel px-2 py-3"
              >
                <div className="h-12 w-12 rounded-full bg-wa-border" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/2 rounded bg-wa-border" />
                  <div className="h-3 w-3/4 rounded bg-wa-border" />
                </div>
              </div>
            ))}
          </div>
        ) : visibleGroups.length === 0 ? (
          // Mensagem de "Nenhum Grupo"
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-wa-text-secondary">
            <p className="text-sm">Nenhuma conversa encontrada.</p>
            <p className="text-xs text-wa-text-secondary/70">Envie ou receba mensagens para começar.</p>
          </div>
        ) : (
          renderSection('Conversas Recentes', visibleGroups)
        )}
      </div>
    </aside>
  );
};

export default GroupList;
