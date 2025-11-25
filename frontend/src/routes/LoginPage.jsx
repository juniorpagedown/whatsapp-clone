import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.png';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Se já está autenticado, redireciona
  if (isAuthenticated) {
    return <Navigate to="/conversas" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);

    if (result.success) {
      navigate('/conversas');
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-wa-bg transition-colors">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-wa-border bg-wa-panel p-8 shadow-xl transition-colors">
        <div className="text-center">
          <img
            src={logo}
            alt="BaladAPP"
            className="mx-auto mb-6 h-24 w-auto object-contain sm:h-28"
          />
          <h2 className="brand-heading mb-2 text-4xl font-bold text-white">BaladAPP</h2>
          <p className="text-wa-text-secondary">Faça login para continuar</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-lg border border-wa-system-red/40 bg-wa-system-red/10 px-4 py-3 text-wa-system-red">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-wa-text-secondary">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-lg border border-wa-border bg-wa-panel-header px-4 py-3 text-wa-text-primary placeholder-wa-text-secondary transition focus:border-wa-primary focus:outline-none focus:ring-2 focus:ring-wa-primary/60"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-wa-text-secondary">
                Senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-lg border border-wa-border bg-wa-panel-header px-4 py-3 text-wa-text-primary placeholder-wa-text-secondary transition focus:border-wa-primary focus:outline-none focus:ring-2 focus:ring-wa-primary/60"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full justify-center rounded-lg bg-wa-primary py-3 px-4 text-sm font-medium text-white transition hover:bg-wa-primary-dark focus:outline-none focus:ring-2 focus:ring-wa-primary/60 focus:ring-offset-2 focus:ring-offset-[rgb(var(--wa-panel))] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
