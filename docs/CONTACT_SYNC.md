# 🔄 Sistema Automático de Sincronização de Nomes de Contatos

## 📋 Resumo

Implementado um sistema automático que busca e atualiza os nomes dos contatos individuais diretamente da Evolution API, eliminando a necessidade de atualização manual.

## ✅ O que foi feito

### 1. **Atualização Manual Imediata**
- Atualizado o contato `554140421212` para `"Pneufree.com"` no banco de dados
- Comando executado: `node backend/update-contact.js "554140421212" "Pneufree.com"`

### 2. **Sistema Automático de Enriquecimento**

#### Arquivo: `backend/src/domain/services/conversation.service.js`

**Função `enrichContactFromEvolution`:**
- Verifica se o nome do contato é igual ao telefone (indicando que não temos o nome real)
- Busca os dados do contato na Evolution API
- Atualiza automaticamente no banco de dados:
  - Nome do contato
  - Foto de perfil (avatar)
  - Metadata adicional

**Integração com `listConversations`:**
- Ao listar conversas, o sistema automaticamente:
  1. Busca o `instanceKey` da instância
  2. Identifica contatos individuais sem nome real
  3. Enriquece os contatos em background (não bloqueia a resposta)
  4. Invalida o cache para que a próxima requisição pegue os dados atualizados

### 3. **Correção do Endpoint da Evolution API**

#### Arquivo: `backend/src/domain/services/contactSync.service.js`

**Antes:**
```javascript
// Tentava endpoints que não existem:
/contacts/findContact/${instanceKey}/${phone}
/contacts/getContact/${instanceKey}/${phone}
/contacts/getStatus/${instanceKey}/${phone}
```

**Depois:**
```javascript
// Usa o endpoint correto:
POST /chat/findContacts/${instanceKey}
Body: { "where": { "remoteJid": "phone@s.whatsapp.net" } }
```

### 4. **Script de Teste**

#### Arquivo: `backend/test-evolution-contact.js`

Script para testar a busca de contatos na Evolution API:
```bash
node backend/test-evolution-contact.js "554140421212"
```

## 🔧 Como Funciona

### Fluxo Automático

1. **Frontend solicita lista de conversas** → `GET /conversas`

2. **Backend lista conversas** do banco de dados

3. **Para cada conversa individual:**
   - Verifica se `contato.nome === contato.phone`
   - Se sim, busca na Evolution API em background
   - Atualiza o banco de dados se encontrar nome diferente
   - Invalida cache para próxima requisição

4. **Próxima requisição** já retorna o nome atualizado

### Exemplo de Log

```javascript
{
  "level": "info",
  "message": "Contato enriquecido com dados da Evolution API",
  "phone": "554140421212",
  "oldName": "554140421212",
  "newName": "Pneufree.com"
}
```

## ⚠️ Limitações Conhecidas

### 1. **Dependência do WhatsApp**
- Se o contato não salvou nome no WhatsApp, a Evolution API retorna apenas o número
- Neste caso, o `pushName` será igual ao telefone

### 2. **Solução para Contatos Sem Nome no WhatsApp**

Para contatos que não têm nome salvo no WhatsApp, você tem duas opções:

**Opção A: Atualização Manual (Atual)**
```bash
node backend/update-contact.js "554140421212" "Pneufree.com"
```

**Opção B: Criar Tabela de Aliases (Recomendado)**

Criar uma tabela `contact_aliases` no banco:
```sql
CREATE TABLE contact_aliases (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  alias VARCHAR(255) NOT NULL,
  instance_id INTEGER REFERENCES instances(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(instance_id, phone)
);
```

Modificar a query de conversas para priorizar aliases:
```sql
COALESCE(
  ca.alias,           -- Alias manual (prioridade máxima)
  ct.nome,            -- Nome do banco
  metadata->>'pushName', -- Nome da Evolution API
  ct.phone            -- Fallback: telefone
) as nome
```

## 📊 Estrutura de Dados

### Contato na Evolution API
```json
{
  "id": "cmiezivig00con463gz9o0umy",
  "remoteJid": "554140421212@s.whatsapp.net",
  "pushName": "554140421212",  // ← Pode ser só o número
  "profilePicUrl": "https://...",
  "isGroup": false,
  "isSaved": true,
  "type": "contact"
}
```

### Contato no Banco de Dados
```sql
SELECT 
  id,
  phone,           -- "554140421212"
  nome,            -- "Pneufree.com" (atualizado)
  profile_pic_url, -- URL da foto
  metadata         -- { "evolution": { ... } }
FROM contatos
WHERE phone = '554140421212';
```

## 🚀 Próximos Passos (Opcional)

### 1. **Implementar Tabela de Aliases**
- Permitir que usuários definam nomes personalizados para contatos
- Priorizar aliases sobre nomes da Evolution API

### 2. **Interface de Gerenciamento**
- Criar página no frontend para editar nomes de contatos
- Botão "Editar Nome" ao lado de cada conversa

### 3. **Sincronização Periódica**
- Criar job que roda periodicamente (ex: a cada 6 horas)
- Atualiza todos os contatos com nomes vazios ou iguais ao telefone

### 4. **Webhook de Atualização**
- Escutar eventos da Evolution API quando contatos são atualizados
- Atualizar automaticamente no banco de dados

## 📝 Comandos Úteis

```bash
# Atualizar nome de um contato manualmente
node backend/update-contact.js "TELEFONE" "NOME"

# Testar busca na Evolution API
node backend/test-evolution-contact.js "TELEFONE"

# Limpar cache do Redis (forçar atualização)
docker exec whatsapp-clone-redis-1 redis-cli FLUSHDB

# Ver logs do backend
docker logs whatsapp-clone-backend-1 --tail 50 -f

# Reiniciar backend
docker restart whatsapp-clone-backend-1
```

## 🎯 Resultado Final

✅ **Contato atualizado:** `554140421212` agora aparece como `"Pneufree.com"`

✅ **Sistema automático:** Novos contatos serão enriquecidos automaticamente

✅ **Performance:** Enriquecimento em background não bloqueia requisições

✅ **Cache:** Sistema de cache evita requisições desnecessárias à Evolution API

---

**Data de Implementação:** 25/11/2025  
**Versão:** 1.0.0
