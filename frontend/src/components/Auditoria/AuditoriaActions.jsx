import React from 'react';

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const AuditoriaActions = ({
  loading,
  info,
  error,
  successMessage,
  onRefresh,
  onFinalize,
  finalizing,
  canFinalize,
  showFinalizeButton = true
}) => {
  const pendingCount = info?.totalMensagens ?? 0;
  const disabledFinalize = !canFinalize || finalizing || loading;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2 text-xs text-wa-text-secondary">
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading || finalizing}
          className="rounded border border-wa-border px-3 py-1 font-semibold uppercase tracking-wide transition-colors hover:border-wa-primary hover:text-wa-text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Atualizando…' : 'Atualizar período'}
        </button>
        {showFinalizeButton && (
          <button
            type="button"
            onClick={onFinalize}
            disabled={disabledFinalize}
            className={`rounded px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors ${
              disabledFinalize
                ? 'cursor-not-allowed border border-wa-border text-wa-text-secondary/70'
                : 'border border-wa-primary bg-wa-primary/10 text-wa-primary hover:bg-wa-primary/20'
            }`}
          >
            {finalizing ? 'Finalizando…' : 'Finalizar auditoria'}
          </button>
        )}
      </div>

      {info && (
        <div className="text-right text-xs text-wa-text-secondary">
          <div>
            Período aberto desde{' '}
            <span className="font-semibold text-wa-text-primary">
              {formatDateTime(info.periodoInicio)}
            </span>
          </div>
          <div>
            Mensagens no período:{' '}
            <span className="font-semibold text-wa-text-primary">
              {pendingCount}
            </span>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="text-xs font-semibold text-wa-system-green">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="text-xs font-semibold text-wa-system-red">
          {error}
        </div>
      )}
    </div>
  );
};

export default AuditoriaActions;
