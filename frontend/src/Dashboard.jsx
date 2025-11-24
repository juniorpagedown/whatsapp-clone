import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { TrendingUp, MessageSquare, Users, Brain } from 'lucide-react';

const DashboardAnalytics = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get('/api/dashboard/stats');
      setStats(response.data?.data || {});
    } catch (err) {
      console.error('Erro ao carregar dados do dashboard:', err);
      setError('Não foi possível carregar as métricas. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-wa-primary border-t-transparent"></div>
          <p className="text-wa-text-secondary">Carregando analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-wa-border bg-wa-panel-header p-6 text-center text-wa-text-secondary">
        <p>{error}</p>
      </div>
    );
  }

  const safeStats = stats || {};

  return (
    <div className="mx-auto max-w-7xl space-y-8 transition-colors">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-wa-text-primary">Dashboard de Analytics</h1>
        <p className="text-wa-text-secondary">Métricas e insights das conversas</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<MessageSquare className="h-6 w-6" />}
          title="Total Mensagens"
          value={safeStats.total_mensagens || 0}
          color="cyan"
        />
        <StatCard
          icon={<Users className="h-6 w-6" />}
          title="Conversas Ativas"
          value={safeStats.total_conversas || 0}
          color="green"
        />
        <StatCard
          icon={<Brain className="h-6 w-6" />}
          title="Com Embeddings"
          value={safeStats.mensagens_com_embedding || 0}
          color="purple"
        />
        <StatCard
          icon={<TrendingUp className="h-6 w-6" />}
          title="Base Conhecimento"
          value={safeStats.conhecimentos_ativos || 0}
          color="orange"
        />
      </div>

      <div className="rounded-lg bg-wa-panel-header p-6 shadow transition-colors">
        <h3 className="mb-4 text-lg font-semibold text-wa-text-primary">Visão Geral</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-wa-panel p-4">
            <span className="text-sm font-medium text-wa-text-secondary">Total de Contatos</span>
            <span className="text-lg font-bold text-wa-text-primary">{safeStats.total_contatos || 0}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-wa-panel p-4">
            <span className="text-sm font-medium text-wa-text-secondary">Total de Grupos</span>
            <span className="text-lg font-bold text-wa-text-primary">{safeStats.total_grupos || 0}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-wa-panel p-4">
            <span className="text-sm font-medium text-wa-text-secondary">Cobertura de Embeddings</span>
            <span className="text-lg font-bold text-wa-link">
              {safeStats.total_mensagens > 0
                ? ((safeStats.mensagens_com_embedding / safeStats.total_mensagens) * 100).toFixed(1) + '%'
                : '0%'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon, title, value, color }) => {
  const colors = {
    cyan: 'bg-cyan-900/50 text-cyan-300',
    green: 'bg-green-900/50 text-green-300',
    purple: 'bg-purple-900/50 text-purple-300',
    orange: 'bg-orange-900/50 text-orange-300'
  };

  return (
    <div className="rounded-lg bg-wa-panel-header p-6 shadow transition-colors">
      <div className="mb-2 flex items-center justify-between">
        <div className={`rounded-lg p-3 ${colors[color]}`}>
          {icon}
        </div>
      </div>
      <h3 className="text-sm font-medium text-wa-text-secondary">{title}</h3>
      <p className="mt-2 text-3xl font-bold text-wa-text-primary">
        {value.toLocaleString()}
      </p>
    </div>
  );
};

export default DashboardAnalytics;
