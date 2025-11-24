# WhatsApp Clone + IA (Backend/Frontend)

Plataforma de atendimento via WhatsApp com histórico de conversas, contexto e integrações com Evolution API, Postgres, Redis e WebSocket.

## Visão rápida
- Recebe mensagens via webhook da Evolution API e salva em Postgres.
- Notifica o frontend em tempo real via Socket.io.
- Contextos/resumos e embeddings (mensagens/base de conhecimento) disponíveis quando `FEATURE_EMBEDDING=true`.
- Frontend React/Vite com proxy para o backend.

## Stack
- Backend: Node 18+, Express, Postgres 16 + pgvector, Redis 7, Bull, Socket.io.
- Frontend: React 18 (Vite), Tailwind.
- Infra: Docker Compose (Postgres, Redis, backend, frontend, worker).

## Rodar local
1) Dependências: Docker e Docker Compose instalados.  
2) Subir tudo:
```bash
docker compose up -d --build
```
3) Acessos:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001
- Postgres: localhost:5432 (db `whatsapp_clone`, user `whatsapp_user`)
- Redis: localhost:6379

## Login padrão
- Usuário: `admin@example.com`
- Senha: `Admin@1234`
Se der 401, limpe o localStorage (`token`) no DevTools → Application → Local Storage, recarregue e tente de novo.

## Variáveis principais
Backend (`backend/.env`):
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `JWT_SECRET` (obrigatório em produção)
- `REDIS_URL` ou `REDIS_HOST`/`REDIS_PORT`
- `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_TOKEN`
- `FEATURE_EMBEDDING` (`true` para gerar embeddings)

Frontend (`frontend/.env`):
- `VITE_API_URL` (ex.: `http://localhost:3001`)
- `VITE_WS_URL` (opcional; se vazio, usa host da API)

Vite já faz proxy de `/api` e `/socket.io` para `VITE_API_URL`.

## Comandos úteis
```bash
docker compose up -d             # subir serviços
docker compose logs -f backend   # logs do backend
docker compose exec backend sh   # shell no container do backend
docker compose exec postgres psql -U whatsapp_user -d whatsapp_clone
```

## Troubleshooting rápido
- **Login 401**: confirme credenciais acima; limpe localStorage `token`; verifique `JWT_SECRET` e hora do host.
- **Socket sem conectar**: verifique `VITE_WS_URL`/`VITE_API_URL` e se o backend está em `:3001`.
- **Embeddings falhando**: cheque `FEATURE_EMBEDDING`, chave do provider (ex.: OpenAI) e logs do worker (`docker compose logs -f worker`).

## Estrutura (simplificada)
- `backend/`: API, websockets, filas, schedulers.
- `backend/workers/`: worker de embeddings.
- `frontend/`: app React.
- `database/schema.sql`: schema atual do Postgres.
- `docker-compose.yml`: serviços locais.

## Rotinas
- Scheduler de contexto: consolida mensagens em `conversa_contexto`, gera resumo/embedding quando ativado.
- Worker de embedding: processa mensagens/base de conhecimento pendentes.

## Segurança básica
- Configure `JWT_SECRET` forte.
- Ajuste `allowedHosts` no Vite dev server se exposto.
- Use HTTPS/Proxy reverso em produção.
