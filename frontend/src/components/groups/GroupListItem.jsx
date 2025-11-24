import React, { useMemo } from 'react';
import GroupAvatar from './GroupAvatar.jsx';

const formatRelativeTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diff / (1000 * 60));
  const diffHours = Math.floor(diff / (1000 * 60 * 60));
  const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'agora';
  if (diffMinutes < 60) return `${diffMinutes} min`;
  if (diffHours < 24) return `${diffHours} h`;
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) {
    return date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  }
  return date.toLocaleDateString('pt-BR');
};

const GroupListItem = ({ group, active, onClick }) => {
  const meta = useMemo(() => {
    const preview = group.preview || '';
    const participants = group.participantsLabel || (Array.isArray(group.participants)
      ? group.participants.filter(Boolean).slice(0, 5).join(', ')
      : '');

    const referenceTimestamp = group.lastActivityAt || group.lastMessageAt;

    return {
      preview: preview.length > 120 ? `${preview.slice(0, 120)}…` : preview,
      participants,
      timestamp: formatRelativeTime(referenceTimestamp),
      badge: group.unread || 0
    };
  }, [
    group.preview,
    group.participants,
    group.lastMessageAt,
    group.lastActivityAt,
    group.unread
  ]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 border-b border-wa-border px-4 py-3 text-left transition-colors ${
        active ? 'bg-wa-list-active' : 'hover:bg-wa-list-hover'
      }`}
    >
      <GroupAvatar
        name={group.name}
        src={group.avatarUrl}
        className="h-12 w-12 flex-shrink-0 bg-wa-panel-header text-wa-text-primary"
        title={group.fullName || group.name}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <span className="flex-1 break-words text-[15px] font-medium leading-tight text-wa-text-primary">
            {group.name}
          </span>
          <span className="flex-shrink-0 text-xs text-wa-text-secondary">{meta.timestamp}</span>
        </div>
        {meta.participants && (
          <p className="mt-1 truncate text-xs uppercase tracking-wide text-wa-link">
            {meta.participants}
          </p>
        )}
        <div className="mt-1 flex items-center">
          <p className="truncate text-sm text-wa-text-secondary">{meta.preview}</p>
          {meta.badge > 0 && (
            <span className="ml-2 min-w-[20px] rounded-full bg-wa-system-green px-2 text-center text-xs font-semibold text-wa-badge-text">
              {meta.badge}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

export default GroupListItem;
