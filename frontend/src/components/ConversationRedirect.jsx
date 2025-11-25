import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getConversationUrl } from '../utils/routes';

/**
 * Componente que redireciona automaticamente para a rota correta
 * baseado no tipo de conversa (individual ou grupo)
 *
 * Usado para compatibilidade com URLs antigas (/groups/:chatId)
 */
const ConversationRedirect = () => {
  const navigate = useNavigate();
  const { chatId } = useParams();

  useEffect(() => {
    if (!chatId) {
      navigate('/conversas', { replace: true });
      return;
    }

    // Detecta automaticamente se é grupo pelo sufixo do chatId
    const isGroup = chatId.endsWith('@g.us');
    const tipo = isGroup ? 'grupo' : 'individual';

    // Redireciona para a rota correta
    const correctUrl = getConversationUrl(decodeURIComponent(chatId), tipo);
    navigate(correctUrl, { replace: true });
  }, [chatId, navigate]);

  // Não renderiza nada, apenas redireciona
  return null;
};

export default ConversationRedirect;
