import React from 'react';
import GroupAvatar from './GroupAvatar.jsx';
import MessageList from './MessageList.jsx';
import MessageComposer from './MessageComposer.jsx';

const GroupChat = ({
  group,
  messages,
  hasMore,
  loadingMessages,
  onLoadMore,
  onSend,
  highlightRange = null
}) => {
  const visibleMessages = messages;

  const mentionLookup = React.useMemo(() => {
    const map = new Map();

    const parseMaybeJson = (value) => {
      if (value && typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch (error) {
          return value;
        }
      }
      return value;
    };

    const registerId = (rawId, displayName) => {
      if (!rawId) {
        return;
      }
      const rawString = String(rawId).trim();
      if (!rawString) {
        return;
      }

      const digitsOnly = rawString.replace(/\D/g, '');
      if (!digitsOnly) {
        return;
      }

      const normalizedName = typeof displayName === 'string' && displayName.trim().length > 0
        ? displayName.trim()
        : digitsOnly;

      const existing = map.get(digitsOnly);
      if (!existing || existing === digitsOnly) {
        map.set(digitsOnly, normalizedName);
      }

      map.set(rawString, normalizedName);
      map.set(`@${digitsOnly}`, normalizedName);
      map.set(`${digitsOnly}@s.whatsapp.net`, normalizedName);
      map.set(`${digitsOnly}@c.us`, normalizedName);
    };

    const nameFromMetadata = (metadata) => {
      if (!metadata) return null;
      const candidates = [
        metadata.pushName,
        metadata.displayName,
        metadata.notifyName,
        metadata.name,
        metadata.profileName,
        metadata.profile?.name,
        metadata.contactName,
        metadata.waName
      ];
      return candidates.find((value) => typeof value === 'string' && value.trim().length > 0) || null;
    };

    const traverseIds = (value, displayName, depth = 0) => {
      if (!value || depth > 3) {
        return;
      }

      if (typeof value === 'string' || typeof value === 'number') {
        const strValue = String(value);
        if (/\d{5,}/.test(strValue)) {
          registerId(strValue, displayName);
        }
        return;
      }

      if (Array.isArray(value)) {
        value.forEach((item) => traverseIds(item, displayName, depth + 1));
        return;
      }

      if (typeof value === 'object') {
        Object.entries(value).forEach(([key, nested]) => {
          if (/(wa)?id|phone|jid|user|participant|contact/i.test(key)) {
            traverseIds(nested, displayName, depth + 1);
          } else if (depth === 0 && key === 'raw') {
            traverseIds(nested, displayName, depth + 1);
          }
        });
      }
    };

    const participants = Array.isArray(group?.raw?.participants)
      ? group.raw.participants
      : [];

    participants.forEach((participant) => {
      const contact = participant?.contato || {};
      const contactMetadata = parseMaybeJson(contact.metadata);

      const displayName =
        (typeof contact.nome === 'string' && contact.nome.trim().length > 0
          ? contact.nome.trim()
          : null) ||
        nameFromMetadata(contactMetadata) ||
        null;

      registerId(contact.phone, displayName);
      registerId(participant?.contatoId, displayName);
      traverseIds(contactMetadata, displayName);
    });

    return map;
  }, [group?.raw?.participants]);

  if (!group) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center text-wa-text-primary wa-chat-background">
        <div className="mb-6 flex h-32 w-32 items-center justify-center rounded-full bg-wa-bubble-in text-5xl">
          💬
        </div>
        <h1 className="text-2xl font-light">Selecione um grupo</h1>
        <p className="mt-3 max-w-md text-sm text-wa-text-secondary">
          Escolha um grupo na barra lateral para visualizar o histórico de mensagens.
        </p>
      </div>
    );
  }

  return (
    <section className="flex h-full flex-1 flex-col wa-chat-background transition-colors">
      <header className="flex min-h-[60px] items-center justify-between gap-4 border-b border-wa-border bg-wa-panel-header px-4 py-2 transition-colors">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <GroupAvatar
            name={group.fullName || group.name}
            src={group.avatarUrl}
            className="h-10 w-10 flex-shrink-0 bg-wa-panel text-wa-text-primary"
            title={group.fullName || group.name}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="break-words text-[15px] font-medium leading-tight text-wa-text-primary">
              {group.fullName || group.name}
            </span>
            <span className="truncate text-xs text-wa-text-secondary">
              {group.participantsLabel || group.name || 'Grupo'}
            </span>
          </div>
        </div>

        {/* Auditoria desativada */}
      </header>

      <MessageList
        messages={visibleMessages}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        loading={loadingMessages}
        activeConversationId={group.id}
        mentionLookup={mentionLookup}
        highlightRange={highlightRange}
      />

      <MessageComposer onSend={onSend} />
    </section>
  );
};

export default GroupChat;
