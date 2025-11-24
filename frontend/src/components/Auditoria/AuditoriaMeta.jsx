import React from 'react';

const formatDateTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const AuditoriaMeta = ({ group, info }) => {
  if (!group) {
    return null;
  }

  const ultimaAuditoria = formatDateTime(group.auditadaEm);
  const periodoInicio = formatDateTime(info?.periodoInicio);
  const mensagensPendentes = info?.totalMensagens ?? 0;

  return (
    <div className="border-b border-wa-border bg-wa-panel px-4 py-2 text-xs text-wa-text-secondary transition-colors">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold text-wa-text-primary">
          {group.isAuditada ? 'Auditoria concluída' : 'Auditoria pendente'}
        </span>

        {group.isAuditada && ultimaAuditoria && (
          <span className="inline-flex items-center gap-1 rounded-full bg-wa-bubble-in px-2 py-[2px] text-[11px] font-semibold uppercase tracking-wide text-wa-text-secondary">
            Auditada em {ultimaAuditoria}
            {group.auditadaPorNome ? ` · ${group.auditadaPorNome}` : ''}
          </span>
        )}

        {!group.isAuditada && periodoInicio && (
          <span className="inline-flex items-center gap-1 rounded-full bg-wa-system-red/15 px-2 py-[2px] text-[11px] font-semibold uppercase tracking-wide text-wa-system-red">
            Novas mensagens desde {periodoInicio}
          </span>
        )}

        {!group.isAuditada && mensagensPendentes > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-wa-system-red px-2 py-[2px] text-[11px] font-semibold uppercase tracking-wide text-white">
            {mensagensPendentes} pendente{mensagensPendentes === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>
  );
};

export default AuditoriaMeta;
