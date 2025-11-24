# Correção de Nomes de Grupos

## Problema

Os grupos estavam sendo **exibidos** na lista com os nomes dos participantes ao invés dos nomes reais dos grupos. Por exemplo, grupos estavam aparecendo como "Suporte Jonas Guilherme", "Juninho", "Nickolas" ao invés dos nomes reais dos eventos.

## Causas Identificadas

Após investigação, foram encontradas **duas causas**:

### 1. **Frontend (useGroups.js)** - CAUSA SECUNDÁRIA

- A função `normalizeGroup` usava `metadata.chatName` com alta prioridade
- O `metadata.chatName` continha o nome do último participante
- Isso fazia com que **mesmo grupos com nomes corretos no banco** fossem exibidos com nomes de participantes

### 2. **Banco de Dados** - CAUSA PRINCIPAL

- **12 grupos** foram salvos com nomes de participantes no banco de dados
- Exemplos encontrados: "Suporte Jonas Guilherme", "Juninho", "Nickolas", "Lucas", "BOKA", "Breno Coutinho"
- Isso aconteceu porque o webhook não priorizava o campo `subject` ao salvar grupos

### 3. **Backend (webhook.controller.js)** - MELHORIA PREVENTIVA

- A função `extractMessageData` não priorizava o campo `subject` para grupos
- A função `ensureGroup` não atualizava nomes inválidos
- Estas melhorias previnem o problema no futuro

## Solução

### 1. Correção Principal no Frontend

#### useGroups.js (CORREÇÃO CRÍTICA)

Removida a referência a `metadata.chatName` da função `normalizeGroup`:

**ANTES (ERRADO)**:
```javascript
const rawName =
  group?.grupo?.nome ||
  group?.nome ||
  group?.metadata?.chatName ||  // ❌ Isso pegava o nome do participante
  chatId ||
  'Grupo';
```

**DEPOIS (CORRETO)**:
```javascript
const rawName =
  group?.grupo?.nome ||  // ✅ Nome real do grupo do banco
  group?.nome ||
  chatId ||
  'Grupo';
```

### 2. Melhorias Preventivas no Backend

#### webhook.controller.js

- **extractMessageData**: Modificada para priorizar `subject` quando for um grupo
- **resolveGroupName**: Melhorada para buscar `subject` em mais lugares do metadata
- **ensureGroup**: Modificada para atualizar o nome quando o nome atual for inválido

### 3. Scripts de Correção

Criados scripts para identificar e corrigir nomes incorretos:

- **reset-participant-names.js**: Identifica e reseta nomes que parecem ser de participantes ✅ **EXECUTADO**
- **update-reset-groups.js**: Atualiza grupos resetados com nomes da Evolution API
- **fix-group-names.js**: Busca e atualiza TODOS os nomes da Evolution API
- **fix-group-names-from-db.js**: Usa dados do metadata já salvos no banco

## Status da Correção

### ✅ O que foi corrigido

1. **Frontend**: Correção aplicada em `useGroups.js`
2. **Backend**: Melhorias aplicadas em `webhook.controller.js` e `postgres.js`
3. **Banco de Dados**: Script `reset-participant-names.js` executado com sucesso
   - 12 grupos resetados
   - 30 grupos com nomes corretos preservados

### ⏳ Próximos Passos

Os 12 grupos que foram resetados atualmente exibem seus `group_id` temporariamente. Eles serão atualizados automaticamente das seguintes formas:

1. **Automático**: Quando o grupo receber a próxima mensagem, o webhook salvará o nome correto
2. **Manual**: Execute `node scripts/update-reset-groups.js` quando a Evolution API estiver respondendo

## Como Usar

### ✅ Correção Imediata (Recomendado)

**A correção no frontend já resolve o problema imediatamente!**

Após aplicar as alterações no arquivo `frontend/src/hooks/useGroups.js`, basta recarregar a página no navegador. Os grupos passarão a exibir seus nomes reais.

**Não é necessário rodar nenhum script** se os grupos já estiverem salvos corretamente no banco de dados.

### 🔧 Scripts de Correção (Apenas se necessário)

Os scripts abaixo são úteis apenas se você identificar que há grupos no banco com nomes incorretos:

#### Opção 1: Corrigir usando dados do banco

```bash
cd backend
node scripts/fix-group-names-from-db.js
```

Este script:
- ✅ Não requer conexão com Evolution API
- ✅ Usa dados do metadata já salvos no banco
- ✅ Mais rápido e confiável

#### Opção 2: Corrigir usando Evolution API

```bash
cd backend
node scripts/fix-group-names.js
```

Este script:
- ⚠️ Requer Evolution API online
- ✅ Busca nomes diretamente da source
- ⏱️ Pode demorar mais

### 📊 Verificação

Para verificar se há grupos com nomes incorretos no banco:

```sql
SELECT group_id, nome, metadata
FROM grupos
WHERE nome = group_id OR nome IS NULL OR LENGTH(TRIM(nome)) = 0;
```

Se a query **não retornar resultados**, os grupos já estão corretos no banco. Só precisa da correção no frontend!

## Resultado Esperado

Após as correções:
- ✅ Frontend exibirá os nomes reais dos grupos imediatamente
- ✅ Novos grupos receberão automaticamente o nome correto do webhook
- ✅ Nomes dos grupos não serão mais substituídos por nomes de participantes
- ✅ Nomes personalizados serão preservados
