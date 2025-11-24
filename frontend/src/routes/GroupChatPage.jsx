import React, {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
import {
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams
} from 'react-router-dom';
import GroupChat from '../components/groups/GroupChat.jsx';
import { useGroupMessages } from '../hooks/useGroupMessages.js';
import { buildApiUrl } from '../utils/api';
import { useAuth } from '../contexts/AuthContext.jsx';
import { concludeAudit, fetchOpenPeriod } from '../services/auditoriaApi.ts';

const GroupChatPage = () => {
  const { chatId: rawChatId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const auditoriaReaberta = searchParams.get('auditoriaReaberta');

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
  const [autoOpenClassification, setAutoOpenClassification] = useState(false);
  const [reopenBanner, setReopenBanner] = useState(null);

  const conversationId = group?.id || null;

  const previouslyAuditedRange = useMemo(() => {
    if (!auditInfo?.auditoriaReabertaId) {
      return null;
    }
    return {
      from: auditInfo.auditoriaReabertaInicio || auditInfo.periodoInicio || null,
      to: auditInfo.auditoriaReabertaFim || null
    };
  }, [auditInfo?.auditoriaReabertaFim, auditInfo?.auditoriaReabertaId, auditInfo?.auditoriaReabertaInicio, auditInfo?.periodoInicio]);

  const activeRange = useMemo(() => {
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    if (!fromParam && !toParam) {
      return null;
    }
    return {
      from: fromParam,
      to: toParam
    };
  }, [searchParams]);

  const loadAuditInfo = useCallback(async () => {
    if (!conversationId) {
      setAuditInfo(null);
      setAuditError(null);
      setAuditLoading(false);
      return;
    }

    setAuditLoading(true);
    setAuditError(null);

    try {
      const period = await fetchOpenPeriod(conversationId);
      setAuditInfo(period);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar informações de auditoria';
      setAuditInfo(null);
      setAuditError(message);
    } finally {
      setAuditLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!decodedChatId) {
      navigate('/groups', { replace: true });
    }
  }, [decodedChatId, navigate]);

  useEffect(() => {
    if (!auditoriaReaberta || !decodedChatId) {
      return;
    }

    let updatedState = false;

    if (typeof setGroups === 'function') {
      setGroups((prevGroups) => {
        const reopenedAt = new Date().toISOString();
        let found = false;

        const updated = prevGroups.map((item) => {
          if (item.chatId !== decodedChatId) {
            return item;
          }

          found = true;
          updatedState = true;

          const rawLastMessage =
            item.raw?.lastMessage ||
            item.raw?.last_message ||
            item.lastMessage ||
            null;
          const previewText =
            rawLastMessage?.texto ||
            rawLastMessage?.caption ||
            item.raw?.ultimaMensagem ||
            item.preview ||
            '';
          const lastMessageTimestamp =
            rawLastMessage?.timestamp ||
            item.raw?.ultimaMensagemTimestamp ||
            item.lastMessageAt ||
            null;

          return {
            ...item,
            isAuditada: false,
            auditadaEm: null,
            auditadaPor: null,
            auditadaPorNome: null,
            auditoriaAtual: null,
            preview: previewText,
            lastMessageAt: lastMessageTimestamp,
            lastActivityAt: lastMessageTimestamp || reopenedAt,
            raw: item.raw
              ? {
                  ...item.raw,
                  isAuditada: false,
                  is_auditada: false,
                  auditadaEm: null,
                  auditada_em: null,
                  auditadaPor: null,
                  auditada_por: null
                }
              : item.raw
          };
        });

        if (!found) {
          return prevGroups;
        }

        return [...updated].sort((a, b) => {
          if (a.isAuditada !== b.isAuditada) {
            return a.isAuditada ? 1 : -1;
          }

          const dateA = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
          const dateB = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
          return dateB - dateA;
        });
      });
    }

    if (!updatedState && !group) {
      return;
    }

    refetchGroups?.();
    setAutoOpenClassification(true);
    setReopenBanner('Auditoria reaberta! Revise as mensagens e reclasifique se necessário.');

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('auditoriaReaberta');
    setSearchParams(nextParams, { replace: true });
  }, [auditoriaReaberta, decodedChatId, group, refetchGroups, searchParams, setGroups, setSearchParams]);

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
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(buildApiUrl('/api/mensagens/send'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ chatId: decodedChatId, texto: text })
      });

      if (!response.ok) {
        throw new Error(`Erro ao enviar mensagem (${response.status})`);
      }

      const payload = await response.json();
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

  const handleRefreshAudit = useCallback(() => {
    setAuditSuccess(null);
    loadAuditInfo();
  }, [loadAuditInfo]);

  const handleFinalizeAudit = useCallback(async () => {
    if (!conversationId || !auditInfo) {
      return;
    }

    if (!user?.id) {
      setAuditError('Usuário sem permissão para concluir auditoria.');
      return;
    }

    if (!auditInfo.totalMensagens || auditInfo.totalMensagens <= 0) {
      setAuditError('Não há mensagens novas para auditar.');
      return;
    }

    const observation = window.prompt('Observação (opcional):', '');

    setAuditFinalizing(true);
    setAuditError(null);

    try {
      await concludeAudit({
        conversa_id: conversationId,
        data_inicio: auditInfo.periodoInicio,
        data_fim: new Date().toISOString(),
        usuario_id: user.id,
        qtd_mensagens: auditInfo.totalMensagens,
        observacao: observation && observation.trim().length > 0 ? observation.trim() : undefined,
        metadata: {
          origem: 'groups_page',
          mensagens_renderizadas: messageCount
        }
      });

      setAuditSuccess('Auditoria concluída com sucesso.');
      await loadAuditInfo();
      refetchGroups?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível concluir a auditoria';
      setAuditError(message);
    } finally {
      setAuditFinalizing(false);
    }
  }, [conversationId, auditInfo, user?.id, messageCount, loadAuditInfo, refetchGroups]);

  const handleAutoOpenHandled = useCallback(() => {
    setAutoOpenClassification(false);
  }, []);

  const userCanAudit = user?.role === 'auditor' || user?.role === 'admin';
  const pendingMessages = auditInfo?.totalMensagens ?? 0;
  const groupAuditada = group?.isAuditada ?? false;
  const canFinalizeAudit = Boolean(userCanAudit && !groupAuditada && pendingMessages > 0 && !auditFinalizing);

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
        autoOpenClassification={autoOpenClassification}
        onAutoOpenHandled={handleAutoOpenHandled}
        highlightRange={activeRange}
        previouslyAuditedRange={previouslyAuditedRange}
      />
    </div>
  );
};

export default GroupChatPage;
