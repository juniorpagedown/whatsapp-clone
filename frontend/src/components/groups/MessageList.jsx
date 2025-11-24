import React, { useEffect, useMemo, useRef } from 'react';
import MessageBubble from './MessageBubble';

const formatDayLabel = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Hoje';
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';

  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit'
  });
};

const MessageList = ({
  messages,
  hasMore,
  onLoadMore,
  loading,
  activeConversationId,
  autoOpenFirstClassifiable = false,
  onAutoOpenHandled = () => {},
  mentionLookup,
  highlightRange = null,
  previouslyAuditedRange = null
}) => {
  const containerRef = useRef(null);
  const topSentinelRef = useRef(null);

  useEffect(() => {
    if (!hasMore || !onLoadMore) return undefined;

    const sentinel = topSentinelRef.current;
    if (!sentinel) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      { root: containerRef.current, threshold: 0.1 }
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMore, onLoadMore, messages.length]);

  const grouped = useMemo(() => {
    return messages.reduce((acc, message) => {
      const dayKey = new Date(message.createdAt).toDateString();
      if (!acc.has(dayKey)) {
        acc.set(dayKey, []);
      }
      acc.get(dayKey).push(message);
      return acc;
    }, new Map());
  }, [messages]);

  const featureEnabled = (import.meta.env?.VITE_FEATURE_CLASSIFICATION_BADGE ?? 'true') !== 'false';

  const firstClassifiableMessageId = useMemo(() => {
    if (!autoOpenFirstClassifiable || !featureEnabled) {
      return null;
    }

    for (const message of messages) {
      if (!message?.id) {
        continue;
      }

      const rawText = message?.texto ?? message?.text ?? message?.body ?? '';
      if (typeof rawText !== 'string' || rawText.trim().length === 0) {
        continue;
      }

      const tipoMensagemRaw =
        message?.tipo ||
        message?.tipo_mensagem ||
        message?.type ||
        message?.messageType ||
        null;
      const tipoMensagem = typeof tipoMensagemRaw === 'string'
        ? tipoMensagemRaw.toLowerCase()
        : null;
      const isTextMessage = tipoMensagem
        ? ['text', 'texto', 'conversation'].includes(tipoMensagem)
        : true;

      if (!isTextMessage) {
        continue;
      }

      return message.id;
    }

    return null;
  }, [autoOpenFirstClassifiable, featureEnabled, messages]);

  useEffect(() => {
    if (!autoOpenFirstClassifiable) {
      return undefined;
    }

    if (messages.length === 0) {
      return undefined;
    }

    if (!firstClassifiableMessageId) {
      onAutoOpenHandled?.();
    }

    return undefined;
  }, [autoOpenFirstClassifiable, firstClassifiableMessageId, messages.length, onAutoOpenHandled]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [activeConversationId, messages.length]);

  const isTimestampBetween = (timestamp, range) => {
    if (!range) return false;
    const created = new Date(timestamp).getTime();
    if (Number.isNaN(created)) {
      return false;
    }
    const fromTime = range.from ? new Date(range.from).getTime() : null;
    const toTime = range.to ? new Date(range.to).getTime() : null;

    if (fromTime !== null && created < fromTime) {
      return false;
    }
    if (toTime !== null && created > toTime) {
      return false;
    }
    return true;
  };

  const hasPreviouslyAuditedMessages = useMemo(() => {
    if (!previouslyAuditedRange) return false;
    return messages.some((message) => isTimestampBetween(message.createdAt, previouslyAuditedRange));
  }, [messages, previouslyAuditedRange]);

  const firstHighlightedMessageId = useMemo(() => {
    if (!highlightRange) return null;
    for (const message of messages) {
      if (isTimestampBetween(message.createdAt, highlightRange)) {
        return message.id || message.clientId || null;
      }
    }
    return null;
  }, [highlightRange, messages]);

  useEffect(() => {
    if (!highlightRange || !firstHighlightedMessageId) {
      return undefined;
    }
    const element = document.getElementById(`message-${firstHighlightedMessageId}`);
    if (element && element.scrollIntoView) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return undefined;
  }, [highlightRange, firstHighlightedMessageId]);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-y-auto px-6 py-6 text-wa-text-primary transition-colors"
    >
      <div ref={topSentinelRef} className="h-1 w-full" />

      {hasPreviouslyAuditedMessages && (
        <div className="mb-4 rounded-lg border border-wa-system-yellow/40 bg-wa-system-yellow/10 px-4 py-2 text-xs text-wa-system-yellow">
          Mensagens com a faixa âmbar foram auditadas anteriormente.
        </div>
      )}

      {Array.from(grouped.entries()).map(([day, dayMessages]) => (
        <div key={day} className="mb-6">
          <div className="mx-auto mb-4 w-max rounded-lg bg-wa-chip-bg px-3 py-1 text-xs text-wa-text-secondary shadow-sm">
            {formatDayLabel(day)}
          </div>
          {dayMessages.map((message, index) => {
            const previous = dayMessages[index - 1] || null;
            const isNewSender = previous ? previous.isFromMe !== message.isFromMe : true;
            const shouldAutoOpenClassification =
              autoOpenFirstClassifiable && message?.id && message.id === firstClassifiableMessageId;
            const isHighlighted = isTimestampBetween(message.createdAt, highlightRange);
            const previouslyAudited = isTimestampBetween(message.createdAt, previouslyAuditedRange);

            return (
              <MessageBubble
                key={message.id || message.clientId}
                message={message}
                conversationIdFallback={activeConversationId}
                isNewSender={isNewSender}
                initiallyOpenClassification={shouldAutoOpenClassification}
                onClassificationInitialOpen={onAutoOpenHandled}
                mentionLookup={mentionLookup}
                highlighted={isHighlighted}
                previouslyAudited={previouslyAudited}
              />
            );
          })}
        </div>
      ))}
      
      {loading && (
        <div className="py-4 text-center text-xs text-wa-text-secondary">Carregando…</div>
      )}
      
      {!loading && messages.length === 0 && (
        <div className="flex h-full items-center justify-center text-sm text-wa-text-secondary">
          Nenhuma mensagem por aqui ainda.
        </div>
      )}
    </div>
  );
};

export default MessageList;
