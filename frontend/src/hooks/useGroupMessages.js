import { useCallback, useEffect, useRef, useState } from 'react';
import { chatService } from '../services/chat.service';
import { buildApiUrl } from '../utils/api';
const PAGE_SIZE = 50;

const normalizeMessage = (message) => {
  if (!message) {
    return null;
  }

  const createdAt = message.createdAt || message.timestamp || message.created_at || new Date().toISOString();

  const id = message.id || message.messageId || message.message_id || message.internalId || message.tempId;

  return {
    id,
    clientId: message.clientId || message.tempId || null,
    messageId: message.messageId || message.message_id || null,
    conversationId: message.conversationId || message.conversa_id || null,
    chatId: message.chatId || message.chat_id,
    from: message.from || (message.isFromMe ? 'me' : message.senderPhone || message.senderName),
    senderName: message.senderName || (message.isFromMe ? 'Você' : message.senderPhone || 'Participante'),
    senderPhone: message.senderPhone || null,
    texto: message.texto || message.text || '',
    tipo: message.tipo || message.tipo_mensagem || 'text',
    mediaUrl: message.mediaUrl || message.media_url || null,
    mediaMimeType: message.mediaMimeType || message.media_mime_type || null,
    caption: message.caption || null,
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
        const key = msg.id || msg.clientId;
        if (!key) return;
        map.set(key, { ...map.get(key), ...msg });
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
      const existingIndex = prev.findIndex(
        (msg) =>
          msg.id === normalized.id ||
          (normalized.clientId && msg.clientId === normalized.clientId) ||
          (normalized.messageId && msg.messageId === normalized.messageId)
      );
      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], ...normalized };
        return updated;
      }
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
