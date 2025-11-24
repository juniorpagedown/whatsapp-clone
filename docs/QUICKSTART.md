# Quick Start

## 1. Copiar Arquivos Principais

Role para cima na conversa e copie os seguintes arquivos dos cards:

### Backend (obrigatório)
- **server.js** ← Card "Backend Node.js - WhatsApp Clone"
- **agent.js** ← Card "Exemplo de Agente IA com RAG"
- **maintenance.js** ← Card "Scripts de Manutenção"
- **ai-provider.js** ← Card "Sistema Multi-IA"
- **analytics-routes.js** ← Card "Endpoints de Analytics"

### Database (obrigatório)
- **schema.sql** ← Card "Schema PostgreSQL com pgvector"
- **seed.js** ← Card "seed.js - Popular Banco"

### Frontend (obrigatório)
- **App.jsx** ← Card "WhatsApp Web Clone"
- **Dashboard.jsx** ← Card "Dashboard de Analytics"

## 2. Instalar PostgreSQL

```bash
# Ubuntu/Debian
sudo bash scripts/install-postgres.sh
```

## 3. Configurar

```bash
# Backend
cd backend
cp .env.example .env
nano .env  # Configure suas credenciais

# Instalar dependências
npm install
```

## 4. Criar Banco

```bash
# Criar banco e tabelas
psql -U postgres -f database/schema.sql

# Popular dados iniciais
cd database && node seed.js
```

## 5. Executar

```bash
# Backend
cd backend
npm start

# Frontend (em outro terminal)
cd frontend
npm install
npm run dev
```

## 6. Acessar

- Frontend: http://localhost:3000
- Backend: http://localhost:3001
- Health: http://localhost:3001/health

## Próximos Passos

1. Configure webhook na Evolution API
2. Teste envio de mensagens
3. Configure SSL para produção
4. Leia docs/DEPLOYMENT.md
