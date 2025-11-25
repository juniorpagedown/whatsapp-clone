import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chatService } from '../services/chat.service';
import { buildApiUrl } from '../utils/api';

const GROUP_FETCH_LIMIT = 500;

const urlKeyHints = ['avatar', 'profile', 'picture', 'thumb', 'image', 'icon'];

const isLikelyImageUrl = (value) => {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') {
    return false;
  }

  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:image');
};

const resolveCandidateUrl = (input, depth = 0, visited = new Set()) => {
  if (!input || depth > 4) {
    return null;
  }

  if (typeof input === 'string') {
    return isLikelyImageUrl(input) ? input.trim() : null;
  }

  if (typeof input !== 'object') {
    return null;
  }

  const identity = (() => {
    try {
      return JSON.stringify(input);
    } catch (error) {
      return null;
    }
  })();

  if (identity && visited.has(identity)) {
    return null;
  }

  if (identity) {
    visited.add(identity);
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      const nested = resolveCandidateUrl(item, depth + 1, visited);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  const entries = Object.entries(input);
  const prioritized = [
    ...entries.filter(([key]) => urlKeyHints.some((hint) => key.toLowerCase().includes(hint))),
    ...entries.filter(([key]) => !urlKeyHints.some((hint) => key.toLowerCase().includes(hint)))
  ];

  for (const [key, value] of prioritized) {
    if (typeof value === 'string' && isLikelyImageUrl(value)) {
      return value.trim();
    }
  }

  for (const [, value] of prioritized) {
    const nested = resolveCandidateUrl(value, depth + 1, visited);
    if (nested) {
      return nested;
    }
  }

  return null;
};

const getFirstValidString = (...values) => {
  for (const value of values) {
    const resolved = resolveCandidateUrl(value);
    if (resolved) {
      return resolved;
    }
  }
  return null;
};

const normalizeGroup = (group) => {
  if (!group) {
    return null;
  }

  const chatId = group.chatId || group.chat_id;
  const isGroup = group.tipo === 'grupo' || (chatId && chatId.endsWith('@g.us'));

  const parseJsonIfNeeded = (value) => {
    if (typeof value !== 'string') {
      return value;
    }
    try {
      return JSON.parse(value);
    } catch (error) {
      return value;
    }
  };

  const conversationMetadata = parseJsonIfNeeded(group.metadata);
  const groupMetadata = parseJsonIfNeeded(group?.grupo?.metadata);

  const contactName =
    group?.contato?.nome ||
    group?.contato?.phone ||
    conversationMetadata?.chatName ||
    conversationMetadata?.name ||
    (chatId ? chatId.split('@')[0] : 'Contato');

  // Priorizar grupo.nome (nome real do grupo) e ignorar metadata.chatName (que pode ser o nome do participante)
  // Tentar diferentes possíveis caminhos onde o nome do grupo pode estar
  let rawName =
    group?.grupo?.nome || // Nome do objeto grupo (vindo do LEFT JOIN)
    group?.nome || // Nome direto no objeto
    conversationMetadata?.subject || // Nome no metadata (Evolution API)
    conversationMetadata?.chatName || // chatName no metadata
    conversationMetadata?.name || // Alternativa no metadata
    group?.raw?.grupo?.nome || // Fallback para raw
    contactName ||
    (isGroup ? 'Grupo Sem Nome' : 'Contato');

  // Se o nome for igual ao chatId (um JID do WhatsApp), significa que não temos nome real
  if (rawName === chatId || (chatId && rawName.startsWith(chatId.replace('@g.us', '')))) {
    rawName = isGroup ? 'Grupo Sem Nome' : contactName;
  }

  const participants = Array.isArray(group.participants)
    ? group.participants
      .map((participant) => participant?.contato?.nome)
      .filter((name) => typeof name === 'string' && name.trim().length > 0)
    : [];

  const parts = rawName.split(' - ');
  const groupDisplayName = isGroup ? parts[0]?.trim() || rawName : contactName || rawName;
  const fallbackParticipants = parts.length > 1 ? parts.slice(1).map((item) => item.trim()) : [];
  const participantNames = participants.length ? participants : fallbackParticipants;

  const lastMessage = group.lastMessage || group.last_message;
  const lastTimestamp =
    lastMessage?.timestamp ||
    group.ultimaMensagemTimestamp ||
    group.updatedAt ||
    group.createdAt ||
    null;

  let previewText = '';
  let lastActivityAt =
    group?.lastActivityAt ||
    group?.last_activity ||
    lastTimestamp;

  previewText =
    lastMessage?.texto ||
    lastMessage?.caption ||
    group.ultimaMensagem ||
    '';

  const participantsLabel = participantNames.join(', ');

  const avatarUrl = getFirstValidString(
    group?.avatar,
    group?.avatar_url,
    group?.avatarUrl,
    group?.grupo?.avatar,
    group?.grupo?.avatar_url,
    group?.grupo?.avatarUrl,
    conversationMetadata?.avatarUrl,
    conversationMetadata?.avatar,
    conversationMetadata?.pictureUrl,
    conversationMetadata?.profilePictureUrl,
    conversationMetadata?.thumbProfilePictureUrl,
    conversationMetadata?.avatar_url,
    conversationMetadata?.profile_pic_url,
    conversationMetadata?.group,
    conversationMetadata?.groupData,
    conversationMetadata?.chat,
    conversationMetadata?.raw,
    groupMetadata,
    group?.raw?.metadata,
    group?.raw?.grupo,
    group?.contato?.avatar,
    group?.contato?.profile_pic_url,
    group?.contato?.profilePicUrl
  );

  return {
    id: group.id,
    chatId,
    name: groupDisplayName,
    fullName: rawName,
    participants: participantNames,
    participantsLabel,
    preview: previewText,
    lastMessageAt: lastTimestamp,
    lastActivityAt,
    unread: group.unread ?? group.unreadCount ?? 0,
    avatarUrl,
    isGroup,
    tipo: group.tipo,
    raw: group
  };
};

export const useGroups = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const data = await chatService.listConversations({
        tipo: 'all',
        limit: GROUP_FETCH_LIMIT
      }, controller.signal);

      const payload = data;
      const source = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.conversations)
            ? payload.conversations
            : [];

      const normalized = source
        .map((group) => normalizeGroup(group))
        .filter(Boolean)
        .reduce((acc, current) => {
          if (!current.chatId) {
            return acc;
          }
          if (acc.some((item) => item.chatId === current.chatId)) {
            return acc;
          }
          return [...acc, current];
        }, [])
        .sort((a, b) => {
          const dateA = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
          const dateB = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
          return dateB - dateA;
        });

      setGroups(normalized);
    } catch (err) {
      if (err.name === 'AbortError') {
        return;
      }
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchGroups]);

  const byChatId = useMemo(() => {
    const map = new Map();
    groups.forEach((group) => {
      if (group.chatId) {
        map.set(group.chatId, group);
      }
    });
    return map;
  }, [groups]);

  return {
    groups,
    loading,
    error,
    refetch: fetchGroups,
    setGroups,
    groupMap: byChatId
  };
};
