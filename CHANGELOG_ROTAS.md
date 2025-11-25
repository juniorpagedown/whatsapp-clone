# Changelog - Melhoria nas Rotas de Conversas

## Motivação

O sistema usava a rota `/groups/:chatId` tanto para grupos quanto para conversas individuais, o que era confuso e não refletia claramente a diferença entre os tipos de conversa.

## Mudanças Implementadas

### 1. Nova Estrutura de Rotas

**Antes:**
```
/groups                    → Lista de conversas
/groups/:chatId            → Conversa (grupo OU individual)
```

**Depois:**
```
/conversas                      → Lista de conversas
/conversas/chat/:chatId         → Conversa individual
/conversas/grupo/:chatId        → Grupo
```

### 2. Arquivos Criados

#### `frontend/src/utils/routes.js`
Utilitários para navegação consistente:
- `getConversationUrl(chatId, tipo)` - Gera URL correta baseada no tipo
- `getConversationTypeFromUrl(pathname)` - Extrai tipo da URL
- `CONVERSAS_URL` - Constante para rota base

#### `frontend/src/components/ConversationRedirect.jsx`
Componente que redireciona URLs antigas automaticamente para o novo formato.

### 3. Arquivos Modificados

#### `frontend/src/App.jsx`
- Alterou rota principal de `/groups` para `/conversas`
- Adicionou rotas separadas: `chat/:chatId` e `grupo/:chatId`
- Mantém compatibilidade: `/groups` redireciona para `/conversas`

#### `frontend/src/routes/GroupsPage.jsx`
- Importa `getConversationUrl` e `CONVERSAS_URL`
- Atualiza navegação para usar funções utilitárias
- URLs geradas automaticamente com base no tipo

#### `frontend/src/routes/LoginPage.jsx`
- Redireciona para `/conversas` após login (antes `/groups`)

#### `frontend/src/routes/GroupChatPage.jsx`
- Redireciona para `/conversas` em caso de erro (antes `/groups`)

#### `frontend/src/components/Header.jsx`
- Botão "Conversas" navega para `/conversas` (antes `/groups`)
- Atualiza `isActive()` para detectar `/conversas`

#### `frontend/src/routes/ContextoPage.tsx`
- Importa `getConversationUrl`
- Gera URL correta ao navegar para conversa

### 4. Compatibilidade Retroativa

✅ **URLs antigas continuam funcionando:**
- `/groups` → redireciona para `/conversas`
- `/groups/:chatId` → redireciona para `/conversas/chat/:chatId`

O redirecionamento detecta automaticamente se o `chatId` é de um grupo (`@g.us`) ou conversa individual (`@s.whatsapp.net`) e redireciona para a rota correta.

## Benefícios

1. **Clareza**: URLs descrevem exatamente o tipo de conversa
2. **SEO-friendly**: Rotas mais semânticas
3. **Manutenibilidade**: Código mais legível e fácil de entender
4. **Escalabilidade**: Facilita adicionar novos tipos de conversa no futuro
5. **Retrocompatibilidade**: Links antigos continuam funcionando

## Como Usar

### Navegação Manual

```javascript
import { useNavigate } from 'react-router-dom';
import { getConversationUrl, CONVERSAS_URL } from '../utils/routes';

const navigate = useNavigate();

// Lista de conversas
navigate(CONVERSAS_URL);

// Conversa individual
navigate(getConversationUrl('556291825886@s.whatsapp.net', 'individual'));
// Resultado: /conversas/chat/556291825886@s.whatsapp.net

// Grupo
navigate(getConversationUrl('120363400062031801@g.us', 'grupo'));
// Resultado: /conversas/grupo/120363400062031801@g.us
```

### Detecção Automática

```javascript
// A função detecta automaticamente o tipo pelo sufixo
const chatId = '556291825886@s.whatsapp.net'; // individual
navigate(getConversationUrl(chatId));
// Resultado: /conversas/chat/556291825886@s.whatsapp.net

const groupId = '120363400062031801@g.us'; // grupo
navigate(getConversationUrl(groupId));
// Resultado: /conversas/grupo/120363400062031801@g.us
```

## Testes Recomendados

1. ✅ Acessar `/conversas` e verificar lista de conversas
2. ✅ Clicar em uma conversa individual e verificar URL (`/conversas/chat/...`)
3. ✅ Clicar em um grupo e verificar URL (`/conversas/grupo/...`)
4. ✅ Acessar URL antiga `/groups` e verificar redirecionamento
5. ✅ Acessar URL antiga `/groups/:chatId` e verificar redirecionamento
6. ✅ Login deve redirecionar para `/conversas`
7. ✅ Botão "Conversas" no header deve navegar para `/conversas`

## Rollback (se necessário)

Para reverter as mudanças, basta executar:
```bash
git revert <commit-hash>
```

Ou manualmente:
1. Restaurar `App.jsx` para usar `/groups`
2. Remover arquivos `utils/routes.js` e `components/ConversationRedirect.jsx`
3. Reverter mudanças nos outros arquivos
