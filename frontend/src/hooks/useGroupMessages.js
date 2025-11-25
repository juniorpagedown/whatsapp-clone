import { useCallback, useEffect, useRef, useState } from 'react';
import { chatService } from '../services/chat.service';

const PAGE_SIZE = 50;

const normalizeMessage = (message) => {
  if (!message) {
    return null;
  }

  const createdAt = message.createdAt || message.timestamp || message.created_at || new Date().toISOString();

  const id = message.id || message.messageId || message.message_id || message.internalId || message.tempId;

  const texto = message.texto || message.text || '';
  const mediaUrl = message.mediaUrl || message.media_url || null;
  const caption = message.caption || null;

  // Filtrar mensagens sem conteúdo útil (nem texto, nem mídia, nem caption)
  // Mensagens temporárias (status: 'sending') são permitidas
  if (!texto && !mediaUrl && !caption && message.status !== 'sending') {
    return null;
  }

  return {
    id,
    clientId: message.clientId || message.tempId || null,
    messageId: message.messageId || message.message_id || null,
    conversationId: message.conversationId || message.conversa_id || null,
    chatId: message.chatId || message.chat_id,
    from: message.from || (message.isFromMe ? 'me' : message.senderPhone || message.senderName),
    senderName: message.senderName || (message.isFromMe ? 'Você' : message.senderPhone || 'Participante'),
    senderPhone: message.senderPhone || null,
    texto,
    tipo: message.tipo || message.tipo_mensagem || 'text',
    mediaUrl,
    mediaMimeType: message.mediaMimeType || message.media_mime_type || null,
    caption,
    isFromMe: Boolean(message.isFromMe ?? message.is_from_me),
    isForwarded: Boolean(message.isForwarded ?? message.is_forwarded),
    status: message.status || null,
    createdAt: new Date(createdAt).toISOString(),
    metadata: message.metadata || null
  };
};

export const useGroupMessages = (chatId) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const cursorRef = useRef(null);
  const inflightRef = useRef(null);

  const sortMessages = useCallback((list) => {
    return [...list].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateA - dateB;
    });
  }, []);

  const setMessagesSafe = useCallback((updater) => {
    setMessages((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const map = new Map();
      next.forEach((msg) => {
        if (!msg) return;

        // Usar múltiplas chaves para deduplicação mais robusta
        const primaryKey = msg.id || msg.clientId;
        if (!primaryKey) return;

        // Se já existe uma mensagem com este ID, não adicionar novamente
        if (!map.has(primaryKey)) {
          map.set(primaryKey, msg);
        }

        // Também verificar por messageId (para mensagens do WhatsApp)
        if (msg.messageId) {
          const existingByMessageId = Array.from(map.values()).find(
            m => m.messageId === msg.messageId
          );
          if (!existingByMessageId) {
            map.set(primaryKey, msg);
          }
        }
      });
      return sortMessages(Array.from(map.values()));
    });
  }, [sortMessages]);

  const fetchMessages = useCallback(async ({ before } = {}) => {
    if (!chatId) {
      return;
    }
    if (inflightRef.current) {
      inflightRef.current.abort();
    }
    const controller = new AbortController();
    inflightRef.current = controller;

    try {
      setLoading(true);
      setError(null);
      const params = {
        chatId,
        limit: PAGE_SIZE
      };
      if (before) {
        params.before = before;
      }

      const data = await chatService.listMessages(params, controller.signal);

      const payload = data;
      const source = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      const normalized = source.map(normalizeMessage).filter(Boolean);

      setMessagesSafe((prev) => {
        if (before) {
          return [...normalized, ...prev];
        }
        return normalized;
      });

      setHasMore(Boolean(payload?.pagination?.hasMore) || normalized.length === PAGE_SIZE);
      cursorRef.current = payload?.pagination?.nextCursor || (normalized.length ? normalized[0].createdAt : null);
      setInitialLoaded(true);
    } catch (err) {
      if (err.name === 'AbortError') {
        return;
      }
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [chatId, setMessagesSafe]);

  useEffect(() => {
    setMessages([]);
    setHasMore(true);
    setInitialLoaded(false);
    cursorRef.current = null;

    if (chatId) {
      fetchMessages();
    }

    return () => {
      inflightRef.current?.abort();
    };
  }, [chatId, fetchMessages]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading || !initialLoaded) {
      return;
    }
    const cursor = cursorRef.current;
    if (!cursor) {
      setHasMore(false);
      return;
    }
    fetchMessages({ before: cursor });
  }, [fetchMessages, hasMore, initialLoaded, loading]);

  const appendMessage = useCallback((message) => {
    const normalized = normalizeMessage(message);
    if (!normalized) {
      return;
    }
    setMessagesSafe((prev) => {
      // Verificar se a mensagem já existe por múltiplos critérios
      const existingIndex = prev.findIndex((msg) => {
        // 1. Mesmo ID
        if (normalized.id && msg.id === normalized.id) return true;

        // 2. Mesmo clientId
        if (normalized.clientId && msg.clientId === normalized.clientId) return true;

        // 3. Mesmo messageId do WhatsApp
        if (normalized.messageId && msg.messageId === normalized.messageId) return true;

        // 4. Mesma mensagem por conteúdo (timestamp + texto + sender)
        // Isso previne duplicatas quando a mesma mensagem vem via WebSocket e API
        if (
          msg.texto === normalized.texto &&
          msg.isFromMe === normalized.isFromMe &&
          Math.abs(new Date(msg.createdAt).getTime() - new Date(normalized.createdAt).getTime()) < 1000
        ) {
          return true;
        }

        return false;
      });

      if (existingIndex !== -1) {
        // Atualizar mensagem existente
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], ...normalized };
        return updated;
      }

      // Adicionar nova mensagem
      return [...prev, normalized];
    });
  }, [setMessagesSafe]);

  const replaceMessage = useCallback((clientId, nextMessage) => {
    if (!clientId) return;
    const normalized = normalizeMessage({ ...nextMessage, clientId });
    if (!normalized) return;

    setMessagesSafe((prev) => {
      const index = prev.findIndex((msg) => msg.clientId === clientId || msg.id === clientId);
      if (index === -1) {
        return [...prev, normalized];
      }
      const updated = [...prev];
      updated[index] = { ...updated[index], ...normalized };
      return updated;
    });
  }, [setMessagesSafe]);

  return {
    messages,
    loading,
    hasMore,
    error,
    loadMore,
    appendMessage,
    replaceMessage,
    setMessages: setMessagesSafe,
    refetch: () => fetchMessages()
  };
};
