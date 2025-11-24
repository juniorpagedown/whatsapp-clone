# Segurança de Rotas - WhatsApp Clone IA

## ✅ Auditoria de Segurança Concluída

**Data:** 11/10/2025
**Status:** Todas as rotas críticas foram protegidas com autenticação JWT

---

## 🔒 Rotas Protegidas (Requerem Autenticação)

Essas rotas **exigem um token JWT válido** no header `Authorization: Bearer <token>`.

### 1. Conversas
| Método | Rota | Descrição | Role Mínima |
|--------|------|-----------|-------------|
| GET | `/api/conversas` | Lista todas as conversas | Qualquer autenticado |
| GET | `/api/conversas/:id/mensagens` | Lista mensagens de uma conversa | Qualquer autenticado |

### 2. Mensagens
| Método | Rota | Descrição | Role Mínima |
|--------|------|-----------|-------------|
| GET | `/api/mensagens` | Lista mensagens por chatId | Qualquer autenticado |
| POST | `/api/mensagens/send` | Envia uma nova mensagem | Qualquer autenticado |
| POST | `/api/mensagens/enviar` | Envia mensagem (rota legada) | Qualquer autenticado |

### 3. Métricas do Sistema
| Método | Rota | Descrição | Role Mínima |
|--------|------|-----------|-------------|
| GET | `/metrics` | Métricas detalhadas do sistema (CPU, memória, banco, cache) | Qualquer autenticado |

### 4. Usuário Autenticado
| Método | Rota | Descrição | Role Mínima |
|--------|------|-----------|-------------|
| GET | `/api/auth/me` | Retorna dados do usuário logado | Qualquer autenticado |
| POST | `/api/auth/change-password` | Troca senha do usuário | Qualquer autenticado |
| POST | `/api/auth/logout` | Faz logout do usuário | Qualquer autenticado |

---

## 🌐 Rotas Públicas (Sem Autenticação)

Essas rotas estão **disponíveis publicamente** por necessidade operacional.

### 1. Health Checks (Monitoring)
| Método | Rota | Descrição | Motivo |
|--------|------|-----------|--------|
| GET | `/health` | Status geral da aplicação | Load balancers e monitoring |
| GET | `/alive` | Liveness check | Kubernetes/Docker health checks |
| GET | `/ready` | Readiness check | Verificação de dependências |

### 2. Autenticação
| Método | Rota | Descrição | Motivo |
|--------|------|-----------|--------|
| POST | `/api/auth/login` | Login de usuário | Necessário para obter token |
| POST | `/api/auth/register` | Registro de novo usuário (desabilitado por padrão) | Necessário para criar conta (habilite via `ALLOW_SELF_REGISTRATION=true`) |
| POST | `/api/auth/refresh` | Renovar access token | Renovação de sessão |

### 3. Webhooks
| Método | Rota | Descrição | Motivo |
|--------|------|-----------|--------|
| POST | `/webhook` | Webhook da Evolution API | Recebe eventos do WhatsApp |
| POST | `/webhooks` | Alias para webhook | Compatibilidade |
| POST | `/webhook/evolution` | Webhook específico | Recebe eventos do WhatsApp |

**⚠️ Segurança do Webhook:**
- Validação de token configurável via `EVOLUTION_WEBHOOK_TOKEN`
- Aceita requisições sem token se `EVOLUTION_WEBHOOK_ALLOW_NO_TOKEN=true`
- Logs detalhados de todas as requisições recebidas

---

## 🛡️ Proteções Implementadas

### 1. Autenticação JWT
- **Token Type:** Bearer
- **Algoritmo:** HS256
- **Expiração Access Token:** 7 dias (configurável)
- **Expiração Refresh Token:** 30 dias (configurável)
- **Secret:** Configurado via `JWT_SECRET` (deve ser forte e único)

### 2. Rate Limiting
- **Global:** 100 requisições por 15 minutos
- **Auth Routes:** 5 tentativas de login por 15 minutos
- **Backend:** Redis (opcional) ou memória
- **Proteção:** Contra força bruta e DDoS

### 3. Segurança HTTP
- **Helmet.js:** Headers de segurança configurados
- **CORS:** Apenas origens permitidas podem acessar
- **Compression:** Gzip habilitado para performance
- **Body Size Limit:** 10MB máximo

### 4. Validação de Dados
- **Joi Schemas:** Validação de entrada em todas as rotas
- **SQL Injection:** Protegido via parametrização (pg)
- **XSS:** Sanitização de inputs

---

## 📊 Resultados dos Testes

### Teste 1: Acesso SEM token (deve falhar)
```bash
$ curl http://localhost:3001/api/conversas
{
  "success": false,
  "error": {
    "message": "Token não fornecido",
    "statusCode": 401
  }
}
```
✅ **Resultado:** Bloqueado corretamente

### Teste 2: Acesso COM token (deve funcionar)
```bash
$ TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
$ curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/conversas
{
  "data": [
    { "id": 246, "chatId": "...", ... },
    ...
  ]
}
```
✅ **Resultado:** Acesso permitido com 54 conversas retornadas

### Teste 3: Rota pública (deve funcionar sem token)
```bash
$ curl http://localhost:3001/health
{
  "status": "ok",
  "timestamp": "2025-10-11T14:35:40.756Z",
  "services": {
    "postgres": { "status": "healthy" },
    "redis": { "status": "healthy" }
  }
}
```
✅ **Resultado:** Acesso público funcionando

---

## 🔐 Boas Práticas de Segurança

### Para Desenvolvedores

1. **Sempre use HTTPS em produção**
   ```bash
   # Redirecione HTTP para HTTPS no proxy reverso (Nginx, Caddy, etc)
   ```

2. **Rotacione o JWT_SECRET periodicamente**
   ```bash
   # Gerar novo secret
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Monitore tentativas de login falhadas**
   ```bash
   # Logs em backend/logs/
   tail -f backend/logs/error.log | grep "Failed login"
   ```

4. **Use variáveis de ambiente seguras**
   ```bash
   # Nunca commite .env no Git
   echo ".env" >> .gitignore
   ```

### Para Operações

1. **Implemente blacklist de tokens no Redis**
   - Invalide tokens ao fazer logout
   - Tokens comprometidos podem ser bloqueados manualmente

2. **Configure alertas para:**
   - Muitas requisições 401 (possível ataque)
   - Muitas tentativas de login falhadas (força bruta)
   - Acessos fora do horário comercial (suspeito)

3. **Backup do JWT_SECRET**
   - Guarde em cofre de senhas (Vault, 1Password, etc)
   - Documente onde está armazenado

4. **Auditoria de acessos**
   - Logs de todos os acessos autenticados
   - Rastreamento de ações por usuário
   - Retenção de logs por 90+ dias

---

## 📝 Checklist de Segurança

- [x] Rotas de conversas protegidas
- [x] Rotas de mensagens protegidas
- [x] Rota de métricas protegida
- [x] Autenticação JWT implementada
- [x] Rate limiting configurado
- [x] CORS configurado
- [x] Helmet.js ativo
- [x] Validação de entrada (Joi)
- [x] Logs de acesso
- [x] Health checks públicos
- [x] Webhook com validação
- [ ] Blacklist de tokens (Futuro)
- [ ] 2FA/MFA (Futuro)
- [ ] IP Whitelisting (Futuro)

---

## 🚨 Procedimento de Resposta a Incidentes

### Se detectar acesso não autorizado:

1. **Imediato:**
   ```bash
   # Rotacione JWT_SECRET (invalida todos os tokens)
   # Pare o serviço
   pm2 stop backend

   # Atualize JWT_SECRET no .env
   JWT_SECRET=novo_secret_forte

   # Reinicie
   pm2 start backend
   ```

2. **Investigação:**
   ```bash
   # Analise logs
   grep "401\|403" backend/logs/*.log

   # Verifique IPs suspeitos
   grep "Unauthorized" backend/logs/*.log | awk '{print $NF}' | sort | uniq -c
   ```

3. **Notificação:**
   - Informe a equipe de segurança
   - Documente o incidente
   - Revise permissões de usuários

---

## 📞 Contato

Para reportar vulnerabilidades de segurança:
- **NÃO** abra issues públicas no GitHub
- Envie email para: security@seudominio.com
- Use PGP se possível

---

## 📚 Referências

- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

---

**Última atualização:** 11/10/2025
**Versão:** 1.0
**Responsável:** Equipe de Desenvolvimento
