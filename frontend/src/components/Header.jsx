import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Moon, Sun } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext.jsx';

import InstanceSelector from './navigation/InstanceSelector';

const Header = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname.startsWith(path);

  return (
    <header className="flex items-center justify-between border-b border-wa-border bg-wa-panel-header px-4 py-3">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-wa-primary font-semibold text-white">
            {user?.nome?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div>
            <h2 className="font-medium text-wa-text-primary">{user?.nome || 'Usuário'}</h2>
            <p className="text-xs text-wa-text-secondary">{user?.role || 'atendente'}</p>
          </div>
        </div>
        <div className="h-8 w-px bg-wa-border"></div>
        <div className="w-64">
          <InstanceSelector />
        </div>
      </div>

      <nav className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/groups')}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive('/groups')
              ? 'bg-wa-bubble-in text-wa-text-primary'
              : 'text-wa-text-secondary hover:bg-wa-panel hover:text-wa-text-primary'
            }`}
        >
          Conversas
        </button>
        <button
          type="button"
          onClick={() => navigate('/contexto')}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive('/contexto')
              ? 'bg-wa-bubble-in text-wa-text-primary'
              : 'text-wa-text-secondary hover:bg-wa-panel hover:text-wa-text-primary'
            }`}
        >
          Contexto
        </button>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive('/dashboard')
              ? 'bg-wa-bubble-in text-wa-text-primary'
              : 'text-wa-text-secondary hover:bg-wa-panel hover:text-wa-text-primary'
            }`}
        >
          Dashboard
        </button>
      </nav>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-wa-border bg-wa-panel text-wa-icon transition-colors hover:text-wa-text-primary"
          title={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
          aria-label="Alternar tema"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-lg bg-wa-bubble-in px-4 py-2 text-wa-text-primary transition-colors hover:bg-wa-bubble-in/80"
          title="Sair"
        >
          <LogOut size={18} />
          <span className="text-sm">Sair</span>
        </button>
      </div>
    </header>
  );
};

export default Header;
