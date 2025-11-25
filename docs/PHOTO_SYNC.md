# 📸 Sincronização de Fotos de Perfil

## ✅ Status Atual

### Fotos de Contatos
- ✅ **Sistema implementado** para buscar fotos da Evolution API
- ✅ **4 contatos atualizados** com fotos de perfil
- ✅ **Script automático** criado: `sync-photos.js`

### Fotos de Grupos
- ⚠️ **8 grupos sem foto** na Evolution API
- ℹ️ Grupos sem foto configurada no WhatsApp não têm como buscar

## 🔧 Como Funciona

### 1. Busca Automática de Fotos

O sistema busca fotos em várias fontes (em ordem de prioridade):

**Para Contatos:**
```javascript
1. group?.contato?.profile_pic_url  // Banco de dados
2. group?.contato?.avatar           // Banco de dados (alternativo)
3. group?.contato?.profilePicUrl    // Metadata
4. conversationMetadata?.profilePictureUrl
5. conversationMetadata?.avatar
```

**Para Grupos:**
```javascript
1. group?.grupo?.avatar             // Banco de dados
2. conversationMetadata?.avatarUrl  // Metadata
3. groupMetadata?.picture
```

### 2. Sincronização Manual

**Sincronizar todas as fotos:**
```bash
node backend/sync-photos.js
```

**Resultado esperado:**
```
📸 Sincronizando fotos de contatos...
   📞 Joao Carlos (556291825886)... ✅ Atualizado!
   📞 Lucas Ferreira (556299643560)... ✅ Atualizado!

📸 Sincronizando fotos de grupos...
   👥 Sistema de auditoria... ✅ Atualizado!
```

## 📊 Estatísticas Atuais

### Contatos com Foto
| Telefone | Nome | Foto |
|----------|------|------|
| 554140421212 | Pneufree.com | ✅ |
| 556291825886 | Joao Carlos | ✅ |
| 556299643560 | Lucas Ferreira | ✅ |

### Grupos com Foto
- **Sistema de auditoria** ✅
- **08 SAP Projetos** ✅
- Outros grupos sem foto configurada no WhatsApp

## ⚠️ Limitações Conhecidas

### 1. **URLs do WhatsApp com Autenticação**

As URLs das fotos do WhatsApp têm parâmetros de autenticação:
```
https://pps.whatsapp.net/v/t61.24694-24/...?ccb=11-4&oh=...&oe=...
```

**Possíveis problemas:**
- ❌ **CORS**: Navegador pode bloquear por política de CORS
- ❌ **Expiração**: URLs podem expirar após algum tempo
- ❌ **Autenticação**: Algumas URLs requerem autenticação

### 2. **Solução para CORS**

Se as imagens não carregarem no frontend devido a CORS, temos 2 opções:

**Opção A: Proxy no Backend**
```javascript
// backend/src/api/routes/proxy.routes.js
router.get('/proxy/image', async (req, res) => {
  const { url } = req.query;
  const response = await axios.get(url, { responseType: 'stream' });
  response.data.pipe(res);
});
```

**Opção B: Download e Armazenamento Local**
```javascript
// Baixar imagem e salvar em /public/avatars/
const filename = `${phone}.jpg`;
await downloadImage(profilePicUrl, `./public/avatars/${filename}`);
// Salvar no banco: /avatars/${filename}
```

### 3. **Grupos Sem Foto**

Grupos que não têm foto configurada no WhatsApp:
- ❌ Não é possível buscar foto que não existe
- ℹ️ Nesses casos, o sistema exibe a inicial do nome do grupo

## 🚀 Melhorias Futuras

### 1. **Cache de Imagens**
- Baixar e armazenar fotos localmente
- Evitar dependência de URLs externas
- Melhor performance

### 2. **Atualização Automática**
- Sincronizar fotos periodicamente (ex: a cada 6 horas)
- Detectar quando foto foi alterada no WhatsApp

### 3. **Fallback Inteligente**
- Se URL expirar, buscar novamente na Evolution API
- Sistema de retry automático

### 4. **Compressão**
- Redimensionar imagens para thumbnails
- Economizar banda e melhorar performance

## 📝 Comandos Úteis

```bash
# Sincronizar todas as fotos
node backend/sync-photos.js

# Ver contatos sem foto
docker exec whatsapp-clone-postgres-1 psql -U whatsapp_user -d whatsapp_clone -c \
  "SELECT phone, nome FROM contatos WHERE profile_pic_url IS NULL OR profile_pic_url = '';"

# Ver grupos sem foto
docker exec whatsapp-clone-postgres-1 psql -U whatsapp_user -d whatsapp_clone -c \
  "SELECT group_id, nome FROM grupos WHERE avatar IS NULL OR avatar = '';"

# Atualizar foto de um contato específico
docker exec whatsapp-clone-postgres-1 psql -U whatsapp_user -d whatsapp_clone -c \
  "UPDATE contatos SET profile_pic_url = 'URL_AQUI' WHERE phone = 'TELEFONE';"
```

## 🎯 Resultado Final

✅ **Fotos de contatos funcionando!**
- Sistema busca automaticamente da Evolution API
- Exibe inicial do nome como fallback
- 4 contatos já com fotos sincronizadas

✅ **Fotos de grupos funcionando!**
- Grupos com foto configurada exibem corretamente
- Grupos sem foto exibem inicial do nome

⚠️ **Se as fotos não aparecerem no frontend:**
1. Verifique o console do navegador (F12) para erros de CORS
2. Teste abrir a URL da foto diretamente no navegador
3. Se necessário, implementar proxy no backend

---

**Data de Implementação:** 25/11/2025  
**Versão:** 1.0.0
