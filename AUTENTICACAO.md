# Sistema de Autenticação - WhatsApp Clone IA

## Visão Geral

Sistema de autenticação completo com JWT (JSON Web Tokens) implementado no backend e frontend.

## Credenciais de Acesso

### Usuário Admin
- **Email:** admin@exemplo.com
- **Senha:** Admin@123
- **Role:** admin

## URLs de Acesso

### Produção 
- **Frontend:** https://baladapp.lizagent.com.br/
- **Backend API:** https://baladapp.lizagent.com.br/api
- **Login:** https://baladapp.lizagent.com.br/login

### Desenvolvimento (Local)
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001/api
- **Login:** http://localhost:3000/login

## Funcionalidades Implementadas

### Backend

#### Rotas de Autenticação (`/api/auth`)

1. **POST /api/auth/register**
   - Registro de novos usuários (desabilitado por padrão)
   - Validação de dados com Joi
   - Hash de senha com bcrypt (12 rounds)
   - Retorna tokens JWT
   - Habilite temporariamente via `ALLOW_SELF_REGISTRATION=true` quando precisar criar contas manualmente

2. **POST /api/auth/login**
   - Login de usuários
   - Validação de credenciais
   - Atualiza last_login
   - Retorna access token e refresh token

3. **POST /api/auth/refresh**
   - Renovação de access token usando refresh token
   - Valida se token é do tipo refresh

4. **GET /api/auth/me**
   - Retorna dados do usuário autenticado
   - Requer token JWT válido

5. **POST /api/auth/change-password**
   - Troca de senha
   - Requer autenticação
   - Valida senha atual

6. **POST /api/auth/logout**
   - Logout do usuário
   - Remove tokens do cliente

#### Middleware de Autenticação

- **authenticateToken**: Valida token JWT em rotas protegidas
- **requireRole**: Verifica permissões por role (admin, supervisor, atendente)
- **optionalAuth**: Autenticação opcional (não bloqueia se não houver token)

#### Rate Limiting

- Login limitado a 5 tentativas por 15 minutos
- Proteção contra força bruta

### Frontend

#### Componentes

1. **AuthContext** (`src/contexts/AuthContext.jsx`)
   - Context API para gerenciamento de estado de autenticação
   - Funções: login, logout, register
   - Persiste token no localStorage
   - Configura axios automaticamente

2. **LoginPage** (`src/routes/LoginPage.jsx`)
   - Interface de login responsiva
   - Validação de formulário
   - Feedback de erros
   - Redirecionamento após login

3. **ProtectedRoute** (`src/components/ProtectedRoute.jsx`)
   - HOC para proteção de rotas
   - Redireciona para login se não autenticado
   - Loading state durante verificação

4. **Header** (`src/components/Header.jsx`)
   - Exibe informações do usuário
   - Botão de logout
   - Avatar com inicial do nome

## Segurança

### Tokens JWT

- **Access Token**: Expira em 7 dias (configurável)
- **Refresh Token**: Expira em 30 dias (configurável)
- **Secret**: Definido em `JWT_SECRET` no .env

### Senha

- **Hash**: bcrypt com 12 rounds
- **Requisitos**:
  - Mínimo 8 caracteres (registro)
  - Mínimo 6 caracteres (login)
  - Letras maiúsculas, minúsculas e números (registro)

### Headers

- Token enviado como: `Authorization: Bearer <token>`
- CORS configurado para origens permitidas

## Banco de Dados

### Tabela `usuarios`

```sql
CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  avatar TEXT,
  role VARCHAR(50) NOT NULL DEFAULT 'atendente',
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (role IN ('admin', 'supervisor', 'atendente'))
);
```

## Roles e Permissões

### Admin
- Acesso total ao sistema
- Gerenciamento de usuários
- Configurações globais

### Supervisor
- Visualização de métricas
- Gerenciamento de atendentes
- Relatórios

### Atendente
- Atendimento de conversas
- Envio de mensagens
- Visualização de histórico

## Testando a API

### Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@exemplo.com",
    "password": "Admin@123"
  }'
```

### Acessar Rota Protegida
```bash
TOKEN="seu_token_aqui"
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### Criar Novo Usuário
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "João Silva",
    "email": "joao@exemplo.com",
    "password": "Senha@123",
    "role": "atendente"
  }'
```

## Variáveis de Ambiente

```env
# JWT
JWT_SECRET=sua_chave_jwt_super_secreta_256bits_aqui_gere_uma_nova
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Bcrypt
BCRYPT_ROUNDS=12

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

## Troubleshooting

### "Token não fornecido"
- Verifique se o header Authorization está sendo enviado
- Formato: `Authorization: Bearer <token>`

### "Token inválido/expirado"
- Use o refresh token para obter novo access token
- Faça login novamente se refresh token expirou

### "Email ou senha inválidos"
- Verifique credenciais
- Confirme que usuário está ativo (is_active = true)

### "Permissão negada"
- Verifique role do usuário
- Confirme que rota permite a role do usuário

## Melhorias Futuras

- [ ] Implementar blacklist de tokens no Redis
- [ ] Two-Factor Authentication (2FA)
- [ ] Recuperação de senha por email
- [ ] Logs de atividades de autenticação
- [ ] Sessões múltiplas (gerenciamento de dispositivos)
- [ ] OAuth2 (Google, Facebook, etc)
