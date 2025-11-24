import React from 'react';
import MessageClassificationBubble from '../classification/MessageClassificationBubble';

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const MessageBubble = ({
  message,
  conversationIdFallback = null,
  isNewSender = false,
  initiallyOpenClassification = false,
  onClassificationInitialOpen = () => {},
  mentionLookup,
  highlighted = false,
  previouslyAudited = false
}) => {
  const {
    isFromMe,
    senderName,
    texto = '',
    mediaUrl,
    createdAt
  } = message;

  const featureEnabled = (import.meta.env.VITE_FEATURE_CLASSIFICATION_BADGE ?? 'true') !== 'false';
  const tipoMensagemRaw = message.tipo || message.tipo_mensagem || message.type || message.messageType || null;
  const tipoMensagem = typeof tipoMensagemRaw === 'string' ? tipoMensagemRaw.toLowerCase() : null;
  const hasTexto = typeof texto === 'string' && texto.trim().length > 0;
  const isTextMessage = tipoMensagem ? ['text', 'texto', 'conversation'].includes(tipoMensagem) : hasTexto;
  const isClassificavel = featureEnabled && (hasTexto || previouslyAudited || isTextMessage);
  const resolvedConversationIdRaw = message.conversationId ?? conversationIdFallback ?? null;
  const resolvedConversationId = React.useMemo(() => {
    if (typeof resolvedConversationIdRaw === 'number' && Number.isInteger(resolvedConversationIdRaw)) {
      return resolvedConversationIdRaw;
    }
    if (typeof resolvedConversationIdRaw === 'string' && /^\d+$/.test(resolvedConversationIdRaw.trim())) {
      return Number.parseInt(resolvedConversationIdRaw.trim(), 10);
    }
    return null;
  }, [resolvedConversationIdRaw]);
  const classificationMessageId = React.useMemo(() => {
    if (typeof message.id === 'number' && Number.isInteger(message.id)) {
      return message.id;
    }
    if (typeof message.id === 'string' && /^\d+$/.test(message.id.trim())) {
      return Number.parseInt(message.id.trim(), 10);
    }
    if (typeof message.messageId === 'number') {
      return message.messageId;
    }
    if (typeof message.messageId === 'string' && /^\d+$/.test(message.messageId.trim())) {
      return Number.parseInt(message.messageId.trim(), 10);
    }
    return null;
  }, [message.id, message.messageId]);
  const canRenderClassification = isClassificavel && classificationMessageId !== null && resolvedConversationId !== null;
  const parsedMetadata = React.useMemo(() => {
    if (!message.metadata) {
      return null;
    }
    if (typeof message.metadata === 'string') {
      try {
        return JSON.parse(message.metadata);
      } catch (error) {
        return null;
      }
    }
    return message.metadata;
  }, [message.metadata]);

  const normalizeMentionId = (value) => {
    if (!value) return null;
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'string') {
      let normalized = value.trim();
      if (!normalized) return null;
      if (normalized.startsWith('@')) {
        normalized = normalized.slice(1);
      }
      const digits = normalized.replace(/\D/g, '');
      return digits.length >= 5 ? digits : null;
    }
    if (typeof value === 'object') {
      const nested =
        value?.jid ||
        value?.id ||
        value?.waid ||
        value?.wid ||
        value?.user ||
        value?.participant ||
        value?.participantId ||
        value?.participant_id ||
        null;
      return normalizeMentionId(nested);
    }
    return null;
  };

  const mentionNames = React.useMemo(() => {
    const map = new Map();
    const lookup = mentionLookup instanceof Map ? mentionLookup : new Map();

    const resolveFromLookup = (id) => {
      if (!id) return null;
      const candidates = [
        id,
        `@${id}`,
        `${id}@s.whatsapp.net`,
        `${id}@c.us`
      ];
      for (const candidate of candidates) {
        if (lookup.has(candidate)) {
          return lookup.get(candidate);
        }
      }
      return null;
    };

    const addMention = (rawId, explicitName) => {
      const id = normalizeMentionId(rawId);
      if (!id) return;

      const displayName =
        (typeof explicitName === 'string' && explicitName.trim().length > 0
          ? explicitName.trim()
          : null) ||
        resolveFromLookup(id);

      if (!displayName) {
        return;
      }

      if (!map.has(id)) {
        map.set(id, displayName);
      }
    };

    const metadataCandidates = [];
    if (parsedMetadata) {
      metadataCandidates.push(parsedMetadata);
      if (parsedMetadata.contextInfo) metadataCandidates.push(parsedMetadata.contextInfo);
      if (parsedMetadata.context) metadataCandidates.push(parsedMetadata.context);
      if (parsedMetadata.mentionsInfo) metadataCandidates.push(parsedMetadata.mentionsInfo);
      if (parsedMetadata.raw) {
        metadataCandidates.push(parsedMetadata.raw);
        if (parsedMetadata.raw.contextInfo) metadataCandidates.push(parsedMetadata.raw.contextInfo);
        if (parsedMetadata.raw.message) {
          metadataCandidates.push(parsedMetadata.raw.message);
          if (parsedMetadata.raw.message.contextInfo) {
            metadataCandidates.push(parsedMetadata.raw.message.contextInfo);
          }
          if (parsedMetadata.raw.message.extendedTextMessage?.contextInfo) {
            metadataCandidates.push(parsedMetadata.raw.message.extendedTextMessage.contextInfo);
          }
        }
      }
    }

    metadataCandidates.forEach((candidate) => {
      if (!candidate || typeof candidate !== 'object') {
        return;
      }

      const lists = [
        candidate.mentions,
        candidate.mentionedJid,
        candidate.mentionedJidList,
        candidate.mentiondJid,
        candidate.mentionedIds,
        candidate.groupMentions
      ];

      lists.forEach((list) => {
        if (!list) return;
        if (Array.isArray(list)) {
          list.forEach((entry) => {
            if (entry && typeof entry === 'object') {
              addMention(
                entry.jid ?? entry.id ?? entry.user ?? entry.waid ?? entry.wid ?? entry.phone,
                entry.displayName ?? entry.name ?? entry.pushName ?? entry.notifyName
              );
            } else {
              addMention(entry, null);
            }
          });
        }
      });

      if (Array.isArray(candidate?.mentions)) {
        candidate.mentions.forEach((entry) => {
          addMention(
            entry?.jid ?? entry?.id ?? entry?.user ?? entry?.waid ?? entry?.wid ?? entry?.phone,
            entry?.displayName ?? entry?.name ?? entry?.pushName ?? entry?.notifyName
          );
        });
      }
    });

    if (typeof texto === 'string') {
      const matches = texto.match(/@(\d{5,})/g);
      if (matches) {
        matches.forEach((match) => {
          const digits = match.slice(1);
          addMention(digits, null);
        });
      }
    }

    const resolvedMentions = parsedMetadata?.resolvedMentions;
    if (resolvedMentions && typeof resolvedMentions === 'object') {
      Object.entries(resolvedMentions).forEach(([phone, name]) => {
        if (!phone) return;
        const digits = normalizeMentionId(phone);
        if (!digits) return;
        if (typeof name === 'string' && name.trim().length > 0) {
          map.set(digits, name.trim());
        }
      });
    }

    return map;
  }, [mentionLookup, parsedMetadata, texto]);

  const formattedText = React.useMemo(() => {
    if (!texto || mentionNames.size === 0) {
      return texto;
    }

    let output = texto;
    mentionNames.forEach((name, id) => {
      const safeName = String(name).replace(/^@+/, '').trim();
      if (!safeName) return;
      const pattern = new RegExp(`@${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
      output = output.replace(pattern, `@${safeName}`);
    });
    return output;
  }, [texto, mentionNames]);

  const alignmentClass = isFromMe ? 'justify-end' : 'justify-start';
  const wrapperSpacing = isNewSender ? 'mt-6 mb-3' : 'mt-2 mb-2';
  const bubbleTone = isFromMe
    ? 'bg-wa-bubble-out rounded-tr-none'
    : 'bg-wa-bubble-in rounded-tl-none';
  const highlightClass = highlighted
    ? 'outline outline-2 outline-wa-link/70 shadow-lg shadow-wa-link/20'
    : '';
  const auditedClass = previouslyAudited
    ? 'border border-wa-system-yellow/60 shadow-lg shadow-wa-system-yellow/20'
    : 'shadow-sm';

  const bubbleStyle = {
    padding: '12px 16px',
    minWidth: hasTexto ? 240 : 180,
    maxWidth: 480
  };

  const bubbleId = message.id ? `message-${message.id}` : message.clientId ? `message-${message.clientId}` : undefined;

  return (
    <div id={bubbleId} className={`flex ${alignmentClass} ${wrapperSpacing}`}>
      <div className="relative flex max-w-full">
        {canRenderClassification ? (
          <MessageClassificationBubble
            messageId={classificationMessageId}
            conversaId={resolvedConversationId}
            anchor="right"
            initiallyOpen={initiallyOpenClassification}
            onInitialOpen={onClassificationInitialOpen}
          />
        ) : null}

        <div
          className={`message-bubble relative rounded-2xl text-[15px] leading-[1.4] text-wa-text-primary transition-colors ${bubbleTone} ${highlightClass} ${auditedClass}`}
          style={bubbleStyle}
          data-testid="message-bubble"
        >
          {previouslyAudited && (
            <span className="absolute -top-3 left-6 rounded-full bg-wa-system-yellow px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-wa-text-primary shadow-sm">
              Auditada
            </span>
          )}
          {!isFromMe && senderName && (
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-wa-link">
              {senderName}
            </span>
          )}

          {formattedText && (
            <p className="m-0 whitespace-pre-wrap break-words text-wa-text-primary">
              {formattedText}
            </p>
          )}

          {mediaUrl && (
            <a
              href={mediaUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-xs text-wa-text-secondary underline"
            >
              Ver mídia
            </a>
          )}

          <div className="mt-2 flex justify-end gap-1 text-[11px] text-wa-bubble-meta">
            <span>{formatTime(createdAt)}</span>
            {isFromMe && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5 text-wa-link"
              >
                <polyline points="20 6 9 17 4 12" />
                <polyline points="16 6 7 15 4 12" />
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
