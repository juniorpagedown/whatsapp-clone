import React from 'react';

const MainNav = ({ items, activePath, onNavigate }) => {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <nav className="hidden items-center gap-1 lg:flex" aria-label="Navegação principal">
      {items.map((item) => {
        const isActive = typeof item.isActive === 'boolean'
          ? item.isActive
          : activePath.startsWith(item.to);

        return (
          <button
            key={item.to}
            type="button"
            onClick={() => onNavigate?.(item)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-wa-bubble-in text-wa-text-primary shadow-sm'
                : 'text-wa-text-secondary hover:bg-wa-panel hover:text-wa-text-primary'
            }`}
          >
            {item.icon && (
              <span className="text-wa-icon">{item.icon}</span>
            )}
            <span>{item.label}</span>
            {typeof item.badge === 'number' && item.badge > 0 && (
              <span className="ml-1 rounded-full bg-wa-system-red px-[6px] py-[2px] text-[11px] font-semibold text-white">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};

export default MainNav;
