import React, {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
import { chatService } from '../services/chat.service';
import {
  useNavigate,
  useOutletContext,
  useParams
} from 'react-router-dom';
import GroupChat from '../components/groups/GroupChat.jsx';
import { useGroupMessages } from '../hooks/useGroupMessages.js';
import { buildApiUrl } from '../utils/api';
import { useAuth } from '../contexts/AuthContext.jsx';
// Auditoria desativada

const GroupChatPage = () => {
  const { chatId: rawChatId } = useParams();
  const navigate = useNavigate();
  const outletContext = useOutletContext();
  const { user } = useAuth();

  const decodedChatId = useMemo(() => {
    try {
      return decodeURIComponent(rawChatId);
    } catch (error) {
      return rawChatId;
    }
  }, [rawChatId]);

  const socket = outletContext?.socket;
  const groups = outletContext?.groups || [];
  const refetchGroups = outletContext?.refetchGroups;
  const groupMap = outletContext?.groupMap;
  const setGroups = outletContext?.setGroups;

  const group = useMemo(() => {
    if (!decodedChatId) return null;
    return groupMap?.get(decodedChatId) || groups.find((item) => item.chatId === decodedChatId) || null;
  }, [decodedChatId, groupMap, groups]);

  const {
    messages,
    hasMore,
    loadMore,
    appendMessage,
    replaceMessage,
    loading,
    error
  } = useGroupMessages(decodedChatId);

  const messageCount = messages?.length ?? 0;

  const [sendingError, setSendingError] = useState(null);
  const [auditInfo, setAuditInfo] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);
  const [auditSuccess, setAuditSuccess] = useState(null);
  const [auditFinalizing, setAuditFinalizing] = useState(false);
  const [reopenBanner, setReopenBanner] = useState(null);

  const conversationId = group?.id || null;

  const previouslyAuditedRange = null;

  const activeRange = null;

  const loadAuditInfo = useCallback(async () => {
    setAuditInfo(null);
    setAuditError(null);
    setAuditLoading(false);
  }, []);

  useEffect(() => {
    if (!decodedChatId) {
      navigate('/groups', { replace: true });
    }
  }, [decodedChatId, navigate]);

  useEffect(() => { }, []);

  useEffect(() => {
    setAuditSuccess(null);
    loadAuditInfo();
  }, [loadAuditInfo]);

  useEffect(() => {
    if (!reopenBanner) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setReopenBanner(null);
    }, 6000);

    return () => clearTimeout(timeout);
  }, [reopenBanner]);

  useEffect(() => {
    if (!socket || !group?.id) {
      return undefined;
    }

    socket.emit('conversation:join', group.id);

    const handleMessage = ({ conversationId, message }) => {
      if (!message) return;

      const conversationIdStr = conversationId !== undefined && conversationId !== null
        ? conversationId.toString()
        : null;
      const groupIdStr = group?.id !== undefined && group?.id !== null
        ? group.id.toString()
        : null;

      if (conversationIdStr && groupIdStr && conversationIdStr !== groupIdStr) {
        return;
      }
      if (message.chatId && message.chatId !== decodedChatId) return;
      appendMessage(message);
    };

    socket.on('conversation:message', handleMessage);

    return () => {
      socket.emit('conversation:leave', group.id);
      socket.off('conversation:message', handleMessage);
    };
  }, [socket, group?.id, decodedChatId, appendMessage]);

  const handleSend = useCallback(async (text) => {
    if (!decodedChatId) return;

    const clientId = `temp-${Date.now()}`;
    const optimisticMessage = {
      id: clientId,
      clientId,
      chatId: decodedChatId,
      conversationId: group?.id,
      texto: text,
      isFromMe: true,
      senderName: 'Você',
      createdAt: new Date().toISOString(),
      status: 'sending'
    };

    appendMessage(optimisticMessage);
    try {
      setSendingError(null);

      const data = await chatService.sendMessage({
        chatId: decodedChatId,
        texto: text
      });

      const payload = data;
      const message = payload?.data || payload?.mensagem;
      if (message) {
        replaceMessage(clientId, { ...message, status: 'sent' });
      }

      refetchGroups?.();
      loadAuditInfo();
    } catch (err) {
      setSendingError(err);
      replaceMessage(clientId, {
        ...optimisticMessage,
        status: 'failed'
      });
    }
  }, [appendMessage, decodedChatId, refetchGroups, replaceMessage, group?.id, loadAuditInfo]);

  useEffect(() => {
    if (error) {
      console.error('Erro ao carregar mensagens:', error);
    }
  }, [error]);

  useEffect(() => {
    if (sendingError) {
      console.error('Erro ao enviar mensagem:', sendingError);
    }
  }, [sendingError]);

  const handleRefreshAudit = useCallback(() => { }, []);

  const handleFinalizeAudit = useCallback(async () => { }, []);

  const userCanAudit = false;
  const pendingMessages = 0;
  const groupAuditada = false;
  const canFinalizeAudit = false;

  useEffect(() => {
    if (!auditSuccess) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setAuditSuccess(null);
    }, 4000);

    return () => clearTimeout(timeout);
  }, [auditSuccess]);

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      <GroupChat
        group={group}
        messages={messages}
        hasMore={hasMore}
        loadingMessages={loading}
        onLoadMore={loadMore}
        onSend={handleSend}
        auditInfo={auditInfo}
        auditLoading={auditLoading}
        auditError={auditError}
        auditSuccess={auditSuccess}
        onRefreshAudit={handleRefreshAudit}
        onFinalizeAudit={handleFinalizeAudit}
        auditFinalizing={auditFinalizing}
        canFinalizeAudit={canFinalizeAudit}
        showFinalizeButton={userCanAudit}
        bannerMessage={reopenBanner}
        highlightRange={activeRange}
        previouslyAuditedRange={previouslyAuditedRange}
      />
    </div>
  );
};

export default GroupChatPage;
