# 🚀 WhatsApp Clone + IA

**Plataforma inteligente de atendimento ao cliente via WhatsApp com IA generativa e busca semântica (RAG)**

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-blue.svg)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-18+-61DAFB.svg)](https://reactjs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 📋 Índice

- [Visão Geral](#-visão-geral)
- [Arquitetura Técnica](#-arquitetura-técnica)
- [Casos de Uso](#-casos-de-uso)
- [Stack Tecnológica](#-stack-tecnológica)
- [Instalação](#-instalação)
- [Configuração](#-configuração)
- [Uso](#-uso)
- [Rotinas de manutenção](#-rotinas-de-manutenção)
- [Consulta de Contextos & Agente RAG](#-consulta-de-contextos--agente-rag)
- [API Reference](#-api-reference)
- [Contribuindo](#-contribuindo)

---

## 🎯 Visão Geral

### **Problema de Negócio**

Empresas recebem milhares de mensagens via WhatsApp diariamente, mas enfrentam:
- ⏱️ **Tempo de resposta alto**: Clientes esperam 10-30 minutos para atendimento
- 💰 **Custo operacional elevado**: Equipes grandes para atendimento 24/7
- 📊 **Perda de contexto**: Histórico de conversas não aproveitado
- 🤖 **Automação limitada**: Chatbots tradicionais com respostas genéricas

### **Nossa Solução**

Sistema híbrido (humano + IA) que:
- ⚡ **Responde instantaneamente** usando IA com contexto real das conversas
- 💡 **Aprende continuamente** com base de conhecimento vetorizada (RAG)
- 👥 **Escala infinitamente** sem aumentar equipe proporcionalmente
- 📈 **Reduz custos em até 70%** comparado a atendimento 100% humano

### **Diferencial Técnico**

```
┌─────────────────────────────────────────────────────────────┐
│  RAG (Retrieval Augmented Generation)                       │
│  ├─ Busca semântica em histórico de conversas               │
│  ├─ Base de conhecimento vetorizada (pgvector)              │
│  ├─ Respostas contextualizadas (não genéricas)              │
│  └─ Aprendizado contínuo com feedback                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Arquitetura Técnica

### **Diagrama de Alto Nível**

```
┌──────────────┐
│   WhatsApp   │ ◄──┐
└──────────────┘    │
                    │
┌──────────────┐    │
│ Evolution API│ ◄──┤ Webhook Bidirectional
└──────┬───────┘    │
       │            │
       ▼            │
┌──────────────────────────────────────────────┐
│            Backend (Node.js + Express)       │
│  ┌─────────────────────────────────────┐    │
│  │  Controllers → Services → Repos     │    │
│  └─────────────────────────────────────┘    │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Redis   │  │   Bull   │  │  Winston │  │
│  │  Cache   │  │  Queues  │  │  Logger  │  │
│  └──────────┘  └──────────┘  └──────────┘  │
└───────┬──────────────────────────────┬──────┘
        │                              │
        ▼                              ▼
┌───────────────────┐        ┌─────────────────┐
│   PostgreSQL 16   │        │   OpenAI API    │
│   + pgvector      │        │   (GPT-4 + Ada) │
│                   │        └─────────────────┘
│  • Conversas      │
│  • Mensagens      │        ┌─────────────────┐
│  • Embeddings     │        │   Ollama        │
│  • Conhecimento   │        │   (Opcional)    │
└───────────────────┘        └─────────────────┘
        ▲
        │
┌───────┴──────────────────┐
│   Frontend (React)       │
│   • Vite                 │
│   • Tailwind CSS         │
│   • Socket.io Client     │
│   • Recharts             │
└──────────────────────────┘
```

### **Fluxo de Processamento de Mensagem**

```
1. WhatsApp → Evolution API → Webhook Backend
                                    │
                                    ▼
2. Salvar mensagem no PostgreSQL (sem embedding)
                                    │
                                    ▼
3. Adicionar à fila Bull (Redis)
                                    │
                                    ▼
4. Worker processa assíncronamente:
   ├─ Gera embedding (OpenAI ou Ollama)
   ├─ Busca contexto relevante (pgvector)
   ├─ Reranking de resultados
   ├─ Gera resposta com LLM
   └─ Envia resposta via Evolution API
                                    │
                                    ▼
5. WebSocket notifica frontend em tempo real
```

Além do worker de mensagens, um scheduler periódico (`CONVERSA_CONTEXTO_CRON`) consolida blocos de mensagens em `conversa_contexto`, gera um resumo com os temas principais do período e armazena o embedding correspondente (quando `FEATURE_EMBEDDING=true`). Isso fornece contexto reutilizável para o RAG sem precisar reler toda a timeline a cada sugestão.

### **RAG Pipeline Detalhado**

```python
# 1. Embedding da pergunta do usuário
pergunta = "Qual o prazo de entrega?"
embedding_pergunta = gerar_embedding(pergunta)  # vetor [1536]

# 2. Busca híbrida (70% vetor + 30% keyword)
resultados_vetor = pgvector.search(embedding_pergunta, limit=20)
resultados_keyword = postgres.full_text_search(pergunta, limit=20)
resultados_fusao = reciprocal_rank_fusion(resultados_vetor, resultados_keyword)

# 3. Reranking com cross-encoder
resultados_reranked = reranker.rerank(pergunta, resultados_fusao, top_k=5)

# 4. Construir contexto
contexto = {
    "conhecimento_base": resultados_reranked[:3],  # Top 3 docs
    "historico_conversa": ultimas_5_mensagens,
    "metadados": { "cliente": nome, "produtos": comprados }
}

# 5. Prompt engineering
prompt = f"""
Você é assistente da empresa X.

Base de Conhecimento:
{contexto['conhecimento_base']}

Histórico:
{contexto['historico_conversa']}

Pergunta: {pergunta}
Resposta:
"""

# 6. Gerar resposta
resposta = openai.chat(prompt, model="gpt-4", temperature=0.7)
```

---

## 💼 Casos de Uso

### **1. E-commerce**
```
📦 Cliente: "Cadê meu pedido #12345?"
🤖 IA: Busca no histórico → Encontra pedido → Verifica rastreamento
     "Seu pedido está em trânsito, chegará amanhã até 18h"
```

### **2. Suporte Técnico**
```
🔧 Cliente: "App travando ao abrir carrinho"
🤖 IA: Busca casos similares → Identifica padrão → Sugere solução
     "Tente limpar o cache do app: Configurações > Apps > Limpar dados"
```

### **3. Agendamento**
```
📅 Cliente: "Quero agendar consulta amanhã de tarde"
🤖 IA: Consulta disponibilidade → Verifica horários livres
     "Tenho disponível 14h30, 15h e 16h. Qual prefere?"
```

### **4. Vendas**
```
💰 Cliente: "Quanto custa o plano premium?"
🤖 IA: Busca tabela de preços → Contexto com promoções ativas
     "Plano Premium: R$ 99/mês (20% OFF esta semana → R$ 79)"
```

---

## 🛠️ Stack Tecnológica

### **Backend**
| Tecnologia | Versão | Função |
|------------|--------|--------|
| Node.js | 18+ | Runtime JavaScript |
| Express | 4.18 | Framework web |
| PostgreSQL | 16+ | Banco de dados principal |
| pgvector | 0.5+ | Extensão para embeddings |
| Redis | 7+ | Cache + filas |
| Bull | 4.11 | Job queue |
| Socket.io | 4.6 | WebSocket real-time |
| Winston | 3.11 | Logging estruturado |
| Helmet | 7.1 | Security headers |
| Joi | 17+ | Validação de dados |

### **Frontend**
| Tecnologia | Versão | Função |
|------------|--------|--------|
| React | 18+ | UI library |
| Vite | 5+ | Build tool |
| Tailwind CSS | 3.3 | Styling |
| Recharts | 2.10 | Gráficos e dashboards |
| Lucide React | 0.294 | Ícones |
| Socket.io Client | 4.6 | WebSocket client |

### **IA & Machine Learning**
| Tecnologia | Modelo | Função |
|------------|--------|--------|
| OpenAI | GPT-4 | Geração de respostas |
| OpenAI | text-embedding-3-small | Embeddings (1536d) |
| Ollama (opcional) | Llama 3.2 | LLM local |
| Ollama (opcional) | nomic-embed-text | Embeddings locais |
| Ollama (opcional) | bge-reranker-v2-m3 | Reranking |

### **Infraestrutura**
- **Docker** + **Docker Compose**: Containerização
- **Nginx**: Reverse proxy + load balancer
- **PM2**: Process manager (Node.js)
- **Evolution API**: Gateway WhatsApp

---

## 📥 Instalação

### **Pré-requisitos**

```bash
# Verificar versões
node -v     # >= 18.0.0
npm -v      # >= 9.0.0
psql --version  # >= 16.0
redis-cli --version  # >= 7.0
```

### **Opção 1: Instalação Local**

```bash
# 1. Clonar repositório
git clone https://github.com/seu-usuario/whatsapp-clone-ia.git
cd whatsapp-clone-ia

# 2. Instalar PostgreSQL com pgvector
sudo apt update
sudo apt install postgresql-16 postgresql-16-pgvector

# 3. Instalar Redis
sudo apt install redis-server
sudo systemctl start redis

# 4. Configurar banco de dados
sudo -u postgres psql
CREATE DATABASE whatsapp_clone;
CREATE USER whatsapp_user WITH PASSWORD 'senha_segura';
GRANT ALL PRIVILEGES ON DATABASE whatsapp_clone TO whatsapp_user;
\q

# 5. Executar migrations
psql -U whatsapp_user -d whatsapp_clone -f database/schema.sql

# 5.1 Rodar migração incremental do catálogo de classificações
psql -U whatsapp_user -d whatsapp_clone -f backend/migrations/007_add_classificacao_catalogo_extras.sql

# 6. Instalar dependências backend
cd backend
npm install
cp .env.example .env
# EDITAR .env com suas credenciais

# 7. Instalar dependências frontend
cd ../frontend
npm install
cp .env.example .env
# EDITAR .env

# 8. Iniciar serviços
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev

# Terminal 3 - Worker (processamento assíncrono)
cd backend
node src/worker.js
```

### **Opção 2: Docker Compose (Recomendado)**

```bash
# 1. Clonar repositório
git clone https://github.com/seu-usuario/whatsapp-clone-ia.git
cd whatsapp-clone-ia

# 2. Configurar variáveis de ambiente
cp .env.example .env
# EDITAR .env com suas credenciais

# 3. Iniciar todos os serviços
docker-compose up -d

# 3.1 Executar migração 007 do catálogo (após containers subirem)
docker-compose exec backend psql -U "$DB_USER" -d "$DB_NAME" -f backend/migrations/007_add_classificacao_catalogo_extras.sql

# 4. Verificar logs
docker-compose logs -f

# 5. Acessar aplicação
# Frontend: http://localhost:3000
# Backend: http://localhost:3001
# Redis: localhost:6379
# PostgreSQL: localhost:5432
```

## 🧠 Sistema de Embeddings Vetoriais

O sistema suporta busca semântica usando PostgreSQL + pgvector.

## 🛠️ Administração do Catálogo de Classificações

Uma interface administrativa está disponível em `/admin/classificacoes` (frontend) para usuários com perfil **admin**. A tela permite:

- Visualizar o catálogo com filtros por status, busca textual, paginação (20 itens/página) e ordenação por prioridade.
- Criar e editar classificações com geração automática de `slug` a partir de macro + item.
- Alternar rapidamente o estado ativo/inativo e realizar soft delete (mantendo histórico) de cada linha.
- Importar lotes via CSV, com relatório por linha indicando criados/atualizados/erros.
- Exportar o catálogo vigente (excluindo removidos) em formato CSV com o mesmo layout de importação.

> **RBAC:** Todos os endpoints `/api/classificacoes` exigem autenticação (`requireAuth`) e role `admin`. As ações são auditadas e registradas na tabela `audit_logs` com as operações `create`, `update`, `toggle_active`, `soft_delete` e `import_csv`.

### Formato do CSV

Cabeçalho obrigatório:

```
macro,item,descricao,cor_hex,prioridade,ativo
```

Exemplo válido:

```
Financeiro,Chargeback,Disputa de cartão,#ef4444,10,true
Operação,Lote,Ajuste de lotes,#22c55e,20,true
Marketing,Campanha,Promoções sazonais,#2563eb,30,true
```

**Documentação completa:** [docs/EMBEDDINGS.md](docs/EMBEDDINGS.md)

**Comandos rápidos:**
```bash
npm run embeddings:diagnose   # Verificar configuração
npm run embeddings:setup      # Setup inicial
npm run embeddings:backfill   # Processar dados existentes
```

**Problemas?** Veja [Troubleshooting](docs/EMBEDDINGS.md#-troubleshooting)

**docker-compose.yml** (Exemplo):

```yaml
version: '3.8'

services:
  postgres:
    image: ankane/pgvector:v0.5.1
    environment:
      POSTGRES_DB: whatsapp_clone
      POSTGRES_USER: whatsapp_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/schema.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U whatsapp_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: production
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: whatsapp_clone
      DB_USER: whatsapp_user
      DB_PASSWORD: ${DB_PASSWORD}
      REDIS_URL: redis://redis:6379
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      EVOLUTION_API_URL: ${EVOLUTION_API_URL}
      EVOLUTION_API_KEY: ${EVOLUTION_API_KEY}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    volumes:
      - ./backend:/app
      - /app/node_modules

  worker:
    build: ./backend
    command: node src/worker.js
    environment:
      NODE_ENV: production
      DB_HOST: postgres
      REDIS_URL: redis://redis:6379
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    depends_on:
      - postgres
      - redis
      - backend

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      VITE_API_URL: http://localhost:3001
    depends_on:
      - backend

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/ssl:/etc/nginx/ssl
    depends_on:
      - backend
      - frontend

volumes:
  postgres_data:
  redis_data:
```

---

## ⚙️ Configuração

### **Variáveis de Ambiente (.env)**

```bash
# ============================================
# SERVIDOR
# ============================================
PORT=3001
NODE_ENV=production  # development | production | test

# ============================================
# BANCO DE DADOS
# ============================================
DB_HOST=localhost
DB_PORT=5432
DB_NAME=whatsapp_clone
DB_USER=whatsapp_user
DB_PASSWORD=sua_senha_super_segura_aqui
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30000

# ============================================
# REDIS (Cache + Filas)
# ============================================
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_URL=redis://localhost:6379

# ============================================
# EVOLUTION API (WhatsApp Gateway)
# ============================================
EVOLUTION_API_URL=https://sua-evolution-api.com
EVOLUTION_API_KEY=sua_chave_api_aqui
EVOLUTION_INSTANCE=sua_instancia

# ============================================
# OPENAI (IA Principal)
# ============================================
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxx
OPENAI_MODEL_CHAT=gpt-4-turbo-preview
OPENAI_MODEL_EMBEDDING=text-embedding-3-small
OPENAI_MAX_TOKENS=500
OPENAI_TEMPERATURE=0.7

# ============================================
# OLLAMA (IA Local - Opcional)
# ============================================
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL_CHAT=llama3.2
OLLAMA_MODEL_EMBEDDING=nomic-embed-text
EMBEDDING_PROVIDER=openai  # openai | local

# ============================================
# SEGURANÇA
# ============================================
JWT_SECRET=sua_chave_jwt_super_secreta_256bits
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12
ALLOWED_ORIGINS=http://localhost:3000,https://seudominio.com

# ============================================
# RATE LIMITING
# ============================================
RATE_LIMIT_WINDOW_MS=900000  # 15 minutos
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_AUTH_MAX=5

# ============================================
# LOGS
# ============================================
LOG_LEVEL=info  # error | warn | info | http | debug
LOG_DIR=./logs
LOG_MAX_SIZE=5242880  # 5MB
LOG_MAX_FILES=5

# ============================================
# BACKUP
# ============================================
BACKUP_DIR=/var/backups/whatsapp
BACKUP_RETENTION_DAYS=7
DIAS_MANTER_MENSAGENS=365

# ============================================
# FEATURES FLAGS
# ============================================
FEATURE_EMBEDDING=true
FEATURE_RAG=true
FEATURE_AUTO_REPLY=false
FEATURE_SENTIMENT_ANALYSIS=true

# ============================================
# MONITORAMENTO
# ============================================
SENTRY_DSN=https://seu-sentry-dsn
APM_ENABLED=false
```

### **Configurar Evolution API**

1. Acesse painel Evolution API
2. Crie nova instância WhatsApp
3. Configure webhook:
   ```
   URL: https://seu-dominio.com/api/webhook/evolution
   Events: messages.upsert, messages.update
   ```
4. Copie `API_KEY` e `INSTANCE_NAME` para `.env`

### **Popular Base de Conhecimento**

```bash
# Executar seed inicial
node database/seed.js

# Ou manualmente via SQL
psql -U whatsapp_user -d whatsapp_clone
INSERT INTO conhecimento_base (titulo, conteudo, tipo, tags) VALUES
('Horário de Atendimento', 'Segunda a sexta, 9h-18h', 'faq', ARRAY['horário']);
```

---

## 🚀 Uso

### **Iniciar Sistema (Desenvolvimento)**

```bash
# Terminal 1 - PostgreSQL (se não estiver rodando)
sudo systemctl start postgresql

# Terminal 2 - Redis
redis-server

# Terminal 3 - Backend
cd backend
npm run dev

# Terminal 4 - Worker
cd backend
node src/worker.js

# Terminal 5 - Frontend
cd frontend
npm run dev
```

### **Acessar Aplicação**

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/health
- **Métricas**: http://localhost:3001/metrics
- **Bull Dashboard**: http://localhost:3001/admin/queues

### **Testar Webhook**

```bash
# Simular mensagem recebida
curl -X POST http://localhost:3001/api/webhook/evolution \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "data": {
      "key": {
        "remoteJid": "5511999999999@s.whatsapp.net",
        "id": "3EB0123456789ABCDEF"
      },
      "message": {
        "conversation": "Olá, qual o horário de atendimento?"
      },
      "pushName": "Cliente Teste"
    }
  }'
```

### **Scripts de Manutenção**

```bash
# Backup do banco
node backend/maintenance.js backup

# Limpar dados antigos
node backend/maintenance.js limpar

# Otimizar banco
node backend/maintenance.js otimizar

# Verificar saúde do sistema
node backend/maintenance.js saude

# Manutenção completa (backup + limpeza + otimização)
node backend/maintenance.js manutencao-completa
```

---

## 🧹 Rotinas de manutenção

### Resetar auditorias

Para cancelar todas as auditorias e liberar as conversas para um novo ciclo:

```bash
cd backend
npm run reset:auditorias
```

Para também remover o histórico da tabela `auditorias` (limpando a tela de histórico), execute:

```bash
cd backend
npm run reset:auditorias:purge
```

> Se o ambiente bloquear conexões ao PostgreSQL, execute o comando com privilégios elevados (ex.: `sudo`) ou ajuste as variáveis de conexão no `.env`.

---

## 🔍 Consulta de Contextos & Agente RAG

### Endpoints principais

- `GET /api/conversas/:conversaId/contextos`  
  Lista blocos resumidos da conversa com filtros de período, paginação (`limit`, `offset`) e busca vetorial opcional (`sort=sim&q=`).

- `POST /api/agente/conversar`  
  Monta o prompt RAG usando os contextos resumidos e chama o modelo configurado em `MODEL_CHAT`.

### Exemplos de uso

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/conversas/123/contextos?limit=10&sort=sim&q=atraso%20de%20pagamento"
```

```bash
curl -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "http://localhost:3001/api/agente/conversar" \
  -d '{"conversaId":"123","pergunta":"O que ficou decidido sobre reembolso?","strategy":"similar","k":5}'
```

> Configure `MODEL_EMBEDDINGS`, `MODEL_CHAT`, `OPENAI_API_KEY` e `RAG_MAX_K` no `.env` para habilitar o pipeline completo.

### Painel administrativo

1. Acesse a aba **Contexto** (rota `/contexto`) no painel admin.  
2. Escolha a conversa desejada no seletor e ajuste filtros, período e ordenação do **Histórico resumido** (debounce de 300 ms no campo de busca).  
3. Clique em **Abrir mensagens do período** para navegar até a conversa (`/groups/:chatId`) já com os parâmetros `from`/`to`, destacando o intervalo correspondente.  
4. Use a ordenação **Similaridade** quando quiser priorizar blocos mais próximos da pergunta atual.

## 📡 API Reference

### **Autenticação**

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "usuario@exemplo.com",
  "password": "senha123"
}

Response 200:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "nome": "João Silva",
    "role": "atendente"
  }
}
```

### **Conversas**

```http
GET /api/conversas
Authorization: Bearer {token}

Response 200:
[
  {
    "id": 1,
    "nome": "Maria Santos",
    "phone": "5511999999999",
    "ultima_mensagem": "Obrigado!",
    "unread_count": 2,
    "tipo": "individual"
  }
]
```

### **Mensagens**

```http
GET /api/conversas/:conversaId/mensagens?cursor=123&limit=50
Authorization: Bearer {token}

Response 200:
{
  "data": [
    {
      "id": 123,
      "texto": "Olá, como posso ajudar?",
      "timestamp": "2025-01-15T10:30:00Z",
      "is_from_me": true
    }
  ],
  "nextCursor": 73,
  "hasMore": true
}
```

```http
POST /api/mensagens/enviar
Authorization: Bearer {token}
Content-Type: application/json

{
  "chat_id": "5511999999999@s.whatsapp.net",
  "texto": "Sua resposta aqui",
  "phone": "5511999999999"
}

Response 200:
{
  "success": true,
  "mensagem": { ... }
}
```

### **Busca Semântica (RAG)**

```http
POST /api/buscar-similar
Authorization: Bearer {token}
Content-Type: application/json

{
  "query": "problemas com entrega",
  "limit": 10
}

Response 200:
[
  {
    "id": 456,
    "texto": "Meu pedido não chegou ainda",
    "similarity": 0.89,
    "timestamp": "2025-01-10T15:20:00Z"
  }
]
```

### **Analytics**

```http
GET /api/analytics/realtime
Authorization: Bearer {token}

Response 200:
{
  "atendimento": {
    "conversas_ativas": 45,
    "em_atendimento": 12,
    "fila_espera": 5,
    "tempo_medio_atendimento": 320
  },
  "ia": {
    "total_interacoes": 1250,
    "tokens_medio": 450,
    "latencia_media": 1200,
    "custo_estimado_usd": 2.45
  }
}
```

### **Auditoria por Período**

Rotas disponíveis apenas para usuários com papel `auditor` ou `admin`.

```http
GET /api/auditoria/conversas-recentes?page=1&pageSize=10
Authorization: Bearer {token}

Response 200:
{
  "data": [
    {
      "conversa": {
        "id": 42,
        "nome": "Grupo Comercial",
        "tipo": "grupo"
      },
      "periodoInicio": "2024-05-01T10:00:00Z",
      "ultimaMensagem": "2024-05-01T10:12:00Z",
      "novasNoPeriodo": 7
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 3
  }
}
```

```http
POST /api/auditoria/concluir
Authorization: Bearer {token}
Content-Type: application/json

{
  "conversa_id": 42,
  "data_inicio": "2024-05-01T10:00:00Z",
  "data_fim": "2024-05-01T10:25:00Z",
  "usuario_id": 7,
  "qtd_mensagens": 15,
  "observacao": "Sem pendências",
  "metadata": {
    "mensagens_lidas_total": 15
  }
}

Response 200:
{
  "id": 318,
  "conversaId": 42,
  "dataInicio": "2024-05-01T10:00:00Z",
  "dataFim": "2024-05-01T10:25:00Z",
  "usuarioId": 7,
  "qtdMensagens": 15,
  "status": "concluida"
}
```

```http
GET /api/auditoria/historico?status=concluida&page=1&pageSize=20
Authorization: Bearer {token}

Response 200:
{
  "data": [
    {
      "id": 318,
      "conversaId": 42,
      "dataInicio": "2024-05-01T10:00:00Z",
      "dataFim": "2024-05-01T10:25:00Z",
      "usuario": { "id": 7, "nome": "Ana Auditoria" },
      "qtdMensagens": 15,
      "status": "concluida"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 24
  },
  "summary": {
    "total": 24,
    "concluidas": 20,
    "reabertas": 3,
    "canceladas": 1
  }
}
```

### **WebSocket Events**

```javascript
// Cliente
socket.on('connect', () => {
  console.log('Conectado ao servidor');
});

socket.on('nova_mensagem', (mensagem) => {
  console.log('Nova mensagem:', mensagem);
});

socket.on('conversa_atualizada', (data) => {
  console.log('Conversa atualizada:', data);
});

socket.on('resposta_ia', (resposta) => {
  console.log('IA respondeu:', resposta);
});

socket.on('metrics_update', (metrics) => {
  console.log('Métricas atualizadas:', metrics);
});
```

**Documentação completa**: [docs/API.md](docs/API.md)

---

## 📈 Métricas de Sucesso

### **Performance**
- ✅ Tempo resposta API: < 200ms (p95)
- ✅ Latência IA: < 2s (geração de resposta)
- ✅ Uptime: > 99.9%
- ✅ Throughput: 1000+ msgs/min

### **Negócio**
- 📊 Redução de 70% no custo operacional
- 📊 Tempo médio de resposta: < 30 segundos
- 📊 Taxa de resolução automática: > 60%
- 📊 NPS: > 8.5

### **IA**
- 🤖 Acurácia de respostas: > 85%
- 🤖 Cobertura de embeddings: > 95%
- 🤖 Custo OpenAI: < $0.01/conversa
- 🤖 Feedback positivo: > 80%

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor, siga o processo:

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'feat: adiciona nova feature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request

---

## 📞 Suporte

- 📧 Email: suporte@lizagent.com.br
- 🐛 Issues: [GitHub Issues](https://github.com/juniorpagedown/whatsapp-clone-ia/issues)

---

## 🙏 Agradecimentos

- [Evolution API](https://evolution-api.com) - Gateway WhatsApp
- [pgvector](https://github.com/pgvector/pgvector) - Vector similarity search
- [OpenAI](https://openai.com) - GPT-4 e embeddings
- [Ollama](https://ollama.ai) - LLM local
- Comunidade open-source

---

<div align="center">

**Feito com ❤️ por [Lindomar Junior](https://github.com/juniorpagedown)**

</div>
