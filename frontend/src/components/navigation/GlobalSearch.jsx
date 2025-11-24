import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';

const GlobalSearch = ({ onSearch }) => {
  const [term, setTerm] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => {
      onSearch?.(term.trim());
    }, 300);

    return () => clearTimeout(handler);
  }, [term, onSearch]);

  const handleSubmit = (event) => {
    event.preventDefault();
    onSearch?.(term.trim());
  };

  return (
    <form
      className="relative hidden w-full max-w-[360px] lg:block"
      onSubmit={handleSubmit}
      role="search"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wa-icon" />
      <input
        type="search"
        className="w-full rounded-lg border border-wa-border bg-wa-panel pl-9 pr-3 py-2 text-sm text-wa-text-primary outline-none transition-colors focus:border-wa-primary focus:ring-2 focus:ring-wa-primary/20"
        placeholder="Buscar conversas ou contatos…"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        aria-label="Buscar em todo o sistema"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-wa-border bg-wa-panel-header px-2 py-[2px] text-[11px] font-semibold text-wa-text-secondary">
        ⌘K
      </span>
    </form>
  );
};

export default GlobalSearch;
