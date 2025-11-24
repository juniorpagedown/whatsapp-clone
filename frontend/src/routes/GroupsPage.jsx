import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import Header from '../components/Header';
import GroupList from '../components/groups/GroupList.jsx';
import { useGroups } from '../hooks/useGroups.js';

const WS_URL = '';

const GroupsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { groups, loading, refetch, setGroups, groupMap } = useGroups();
  const [searchTerm, setSearchTerm] = useState('');
  const socketRef = useRef(null);
  const activeChatIdRef = useRef(null);

  const activeChatId = useMemo(() => {
    const match = /^\/groups\/(.+)$/.exec(location.pathname);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch (error) {
      return match[1];
    }
  }, [location.pathname]);

  const filteredGroups = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter((group) => group.name.toLowerCase().includes(term));
  }, [groups, searchTerm]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  const ensureSocket = useCallback(() => {
    if (socketRef.current) return socketRef.current;
    const socket = io(WS_URL, {
      transports: ['websocket'],
      withCredentials: true
    });

    socket.on('conversation:updated', ({ conversationId, message }) => {
      if (!conversationId || !message) {
        return;
      }

      setGroups((prev) => {
        const map = new Map(prev.map((item) => [item.id, item]));
        const existing = map.get(conversationId);
        if (!existing) {
          refetch();
          return prev;
        }

        const previewText =
          message.texto ||
          message.text ||
          message.caption ||
          existing.preview;
        const messageTimestamp =
          message.createdAt ||
          message.timestamp ||
          message.created_at ||
          existing.lastMessageAt ||
          new Date().toISOString();

        const updated = {
          ...existing,
          preview: previewText,
          lastMessageAt: messageTimestamp,
          lastActivityAt: messageTimestamp,
          isAuditada: false,
          auditadaEm: null,
          auditadaPor: null,
          auditadaPorNome: null,
          auditoriaAtual: null,
          unread:
            activeChatIdRef.current && existing.chatId === activeChatIdRef.current
              ? 0
              : (existing.unread || 0) + (message.isFromMe ? 0 : 1)
        };

        map.set(conversationId, updated);
        return Array.from(map.values()).sort((a, b) => {
          const dateA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const dateB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return dateB - dateA;
        });
      });
    });

    socketRef.current = socket;
    return socket;
  }, [refetch, setGroups]);

  useEffect(() => {
    const socket = ensureSocket();
    return () => {
      socket?.disconnect?.();
      socketRef.current = null;
    };
  }, [ensureSocket]);

  useEffect(() => {
    if (loading) {
      return;
    }

    const firstAvailable = groups.find((group) => !group.isAuditada);
    const currentActive = activeChatId
      ? groups.find((group) => group.chatId === activeChatId)
      : null;

    if (currentActive && !currentActive.isAuditada) {
      return;
    }

    if (firstAvailable) {
      navigate(`/groups/${encodeURIComponent(firstAvailable.chatId)}`, { replace: true });
    } else {
      navigate('/groups', { replace: true });
    }
  }, [activeChatId, groups, loading, navigate]);

  const handleSelectGroup = (group) => {
    if (!group?.chatId) return;
    navigate(`/groups/${encodeURIComponent(group.chatId)}`);
  };

  const contextValue = useMemo(() => {
    const socket = ensureSocket();
    return {
      socket,
      groups,
      loadingGroups: loading,
      refetchGroups: refetch,
      setGroups,
      groupMap
    };
  }, [ensureSocket, groups, loading, refetch, setGroups, groupMap]);

  return (
    <div className="flex h-screen w-full justify-center bg-wa-bg transition-colors">
      <div className="flex h-full w-full max-w-[1400px] flex-col overflow-hidden bg-wa-panel text-wa-text-primary transition-colors">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <GroupList
            groups={filteredGroups}
            loading={loading}
            activeChatId={activeChatId}
            onSelect={handleSelectGroup}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
          />
          <div className="flex flex-1">
            <Outlet context={contextValue} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default GroupsPage;
