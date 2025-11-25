# Grupos vs Conversas Individuais

Este documento explica como o sistema diferencia e trata grupos e conversas individuais (mensagens diretas).

## Identificação

### 1. Por Chat ID (Sufixo WhatsApp)

```javascript
// frontend/src/hooks/useGroups.js:99
const isGroup = group.tipo === 'grupo' || (chatId && chatId.endsWith('@g.us'));
```

**Conversas Individuais:**
- Sufixo: `@s.whatsapp.net`
- Exemplo: `556291825886@s.whatsapp.net`

**Grupos:**
- Sufixo: `@g.us`
- Exemplo: `120363400062031801@g.us`

### 2. Por Campo `tipo` no Banco de Dados

```sql
-- Tabela: conversas
-- Coluna: tipo (varchar)
-- Valores: 'individual' | 'grupo'
```

**Constraint do banco:**
```sql
CHECK (
  (tipo = 'individual' AND contato_id IS NOT NULL AND grupo_id IS NULL) OR
  (tipo = 'grupo' AND grupo_id IS NOT NULL AND contato_id IS NULL)
)
```

## Estrutura de Dados

### Conversas Individuais

**Tabelas relacionadas:**
- `conversas` (tipo = 'individual', contato_id preenchido)
- `contatos` (nome, telefone, avatar)

**Exemplo:**
```json
{
  "id": 29,
  "chat_id": "556291825886@s.whatsapp.net",
  "tipo": "individual",
  "contato_id": 27,
  "grupo_id": null,
  "contato": {
    "id": 27,
    "phone": "556291825886",
    "nome": "Joao Carlos"
  }
}
```

### Grupos

**Tabelas relacionadas:**
- `conversas` (tipo = 'grupo', grupo_id preenchido)
- `grupos` (nome, descrição, avatar)
- `grupo_participantes` (lista de participantes)

**Exemplo:**
```json
{
  "id": 22,
  "chat_id": "120363400062031801@g.us",
  "tipo": "grupo",
  "contato_id": null,
  "grupo_id": 15,
  "grupo": {
    "id": 15,
    "group_id": "120363400062031801@g.us",
    "nome": "⚠️AVISO DE LIMITE ⚠️",
    "participant_count": 40
  }
}
```

## Lógica de Exibição do Nome

### Frontend (useGroups.js:115-147)

```javascript
// 1. Define contactName (para conversas individuais)
const contactName =
  group?.contato?.nome ||                    // ✅ Nome do contato no banco
  group?.contato?.phone ||                   // Fallback: telefone
  conversationMetadata?.chatName ||          // Metadata da conversa
  conversationMetadata?.name ||
  (chatId ? chatId.split('@')[0] : 'Contato');

// 2. Define rawName (prioriza dados de grupo)
let rawName =
  group?.grupo?.nome ||                      // ✅ Nome do grupo (para grupos)
  group?.nome ||                             // Nome direto
  conversationMetadata?.subject ||           // Subject da Evolution API
  conversationMetadata?.chatName ||          // chatName da Evolution API
  conversationMetadata?.name ||
  contactName ||                             // ✅ Usa contactName como fallback
  (isGroup ? 'Grupo Sem Nome' : 'Contato');

// 3. Para GRUPOS: faz split por " - " para separar nome e participantes
const parts = rawName.split(' - ');

// 4. Define nome final baseado no tipo
const groupDisplayName = isGroup
  ? parts[0]?.trim() || rawName              // Para grupos: primeira parte
  : contactName || rawName;                  // Para individuais: contactName
```

## Ordem de Prioridade

### Conversas Individuais
1. `contatos.nome` (banco de dados)
2. `contatos.phone` (telefone do contato)
3. `conversas.metadata.chatName` (Evolution API)
4. Chat ID sem sufixo (último recurso)

### Grupos
1. `grupos.nome` (banco de dados)
2. `conversas.metadata.subject` (Evolution API)
3. `conversas.metadata.chatName` (Evolution API)
4. "Grupo Sem Nome" (fallback)

## Problema Comum: Nome Incorreto

### Causa
O nome incorreto pode vir de dois lugares:
1. **Tabela `contatos`**: Campo `nome` com valor errado
2. **Tabela `conversas`**: Campo `metadata.chatName` com valor errado

### Solução
Use o script `backend/update-contact.js` que atualiza ambos:

```bash
cd backend
node update-contact.js "+55 62 9182-5886" "Nome Correto"
```

O script atualiza:
```sql
-- 1. Atualiza o nome do contato
UPDATE contatos
SET nome = 'Nome Correto'
WHERE phone = '556291825886';

-- 2. Atualiza o metadata da conversa
UPDATE conversas
SET metadata = jsonb_set(metadata, '{chatName}', '"Nome Correto"')
WHERE chat_id = '556291825886@s.whatsapp.net';
```

## Roteamento

### Nova Estrutura (Melhorada)

As rotas agora diferenciam claramente grupos e conversas individuais:

```javascript
// frontend/src/App.jsx
<Route path="/conversas" element={<GroupsPage />}>
  <Route path="chat/:chatId" element={<GroupChatPage />} />
  <Route path="grupo/:chatId" element={<GroupChatPage />} />
</Route>
```

**URLs Novas:**
- `/conversas` - Lista todas as conversas
- `/conversas/chat/556291825886@s.whatsapp.net` - Conversa individual ✅
- `/conversas/grupo/120363400062031801@g.us` - Grupo ✅

**Compatibilidade:**
As rotas antigas (`/groups`) ainda funcionam e redirecionam automaticamente:
- `/groups` → `/conversas`
- `/groups/:chatId` → `/conversas/chat/:chatId` (detecta automaticamente o tipo)

## Componentes

Ambos os tipos usam os mesmos componentes:
- `GroupsPage` - Lista de conversas
- `GroupChatPage` - Visualização de chat
- `GroupListItem` - Item na lista
- `useGroups` - Hook para normalizar dados
- `ConversationRedirect` - Redireciona URLs antigas automaticamente

A diferenciação acontece automaticamente através do campo `tipo` e do sufixo do `chatId`.

## Utilitários de Navegação

Use as funções do módulo `utils/routes.js`:

```javascript
import { getConversationUrl, CONVERSAS_URL } from '../utils/routes';

// Gera URL correta automaticamente
const url = getConversationUrl(chatId, tipo);
// individual: /conversas/chat/556291825886@s.whatsapp.net
// grupo: /conversas/grupo/120363400062031801@g.us

// Navega para lista de conversas
navigate(CONVERSAS_URL); // /conversas
```
