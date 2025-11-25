/**
 * Utilitários para navegação de rotas
 */

/**
 * Gera a URL correta para uma conversa baseada no tipo
 * @param {string} chatId - ID do chat (ex: 556291825886@s.whatsapp.net)
 * @param {string} tipo - Tipo da conversa: 'individual' ou 'grupo'
 * @returns {string} URL da conversa
 */
export function getConversationUrl(chatId, tipo) {
  if (!chatId) return '/conversas';

  // Detecta automaticamente se é grupo pelo sufixo
  const isGroup = tipo === 'grupo' || chatId.endsWith('@g.us');
  const prefix = isGroup ? 'grupo' : 'chat';

  return `/conversas/${prefix}/${encodeURIComponent(chatId)}`;
}

/**
 * Extrai o tipo de conversa da URL atual
 * @param {string} pathname - window.location.pathname
 * @returns {'chat' | 'grupo' | null}
 */
export function getConversationTypeFromUrl(pathname) {
  if (pathname.includes('/conversas/chat/')) return 'chat';
  if (pathname.includes('/conversas/grupo/')) return 'grupo';
  return null;
}

/**
 * URL base para lista de conversas
 */
export const CONVERSAS_URL = '/conversas';
