# 📊 Estrutura do Banco de Dados - WhatsApp Clone IA

## Visão Geral

O banco de dados possui **11 tabelas** organizadas em 4 categorias principais:

1. **Comunicação** (WhatsApp Core)
2. **Inteligência Artificial**
3. **Base de Conhecimento**
4. **Usuários**

---

## 📱 1. COMUNICAÇÃO (WhatsApp Core)

### 👤 CONTATOS
Armazena informações dos contatos individuais.

```sql
• id                  INTEGER PRIMARY KEY
• phone              VARCHAR(20) UNIQUE NOT NULL    -- Telefone único
• nome               VARCHAR(255) NOT NULL
• avatar             TEXT
• profile_pic_url    TEXT
• status_text        TEXT
• is_business        BOOLEAN DEFAULT false
• labels             TEXT[]                         -- Tags/etiquetas
• metadata           JSONB
• created_at         TIMESTAMP DEFAULT NOW()
• updated_at         TIMESTAMP DEFAULT NOW()
• last_interaction   TIMESTAMP
```

**Relacionamentos:**
- 1:N com `CONVERSAS` (um contato pode ter várias conversas)
- 1:N com `MENSAGENS` (um contato pode enviar várias mensagens)
- N:M com `GRUPOS` (via `GRUPO_PARTICIPANTES`)

---

### 👥 GRUPOS
Armazena informações dos grupos do WhatsApp.

```sql
• id                 INTEGER PRIMARY KEY
• group_id           VARCHAR(100) UNIQUE NOT NULL   -- ID do grupo (@g.us)
• nome               VARCHAR(255) NOT NULL           -- Nome do grupo
• descricao          TEXT
• avatar             TEXT
• created_by         VARCHAR(20)
• participant_count  INTEGER DEFAULT 0
• metadata           JSONB
• created_at         TIMESTAMP DEFAULT NOW()
• updated_at         TIMESTAMP DEFAULT NOW()
```

**Relacionamentos:**
- 1:N com `CONVERSAS` (um grupo tem uma conversa)
- N:M com `CONTATOS` (via `GRUPO_PARTICIPANTES`)

---

### 🔗 GRUPO_PARTICIPANTES
Tabela de relacionamento muitos-para-muitos entre grupos e contatos.

```sql
• id          INTEGER PRIMARY KEY
• grupo_id    INTEGER → GRUPOS(id)
• contato_id  INTEGER → CONTATOS(id)
• is_admin    BOOLEAN DEFAULT false
• joined_at   TIMESTAMP DEFAULT NOW()
• left_at     TIMESTAMP                             -- NULL se ainda está no grupo
```

**UNIQUE (grupo_id, contato_id)** - Um contato só pode estar uma vez em cada grupo

---

### 💬 CONVERSAS
Representa uma conversa (individual ou em grupo).

```sql
• id                          INTEGER PRIMARY KEY
• chat_id                     VARCHAR(100) UNIQUE NOT NULL  -- Identificador único
• tipo                        VARCHAR(20) NOT NULL          -- 'individual' ou 'grupo'
• contato_id                  INTEGER → CONTATOS(id)        -- Para conversas individuais
• grupo_id                    INTEGER → GRUPOS(id)          -- Para conversas em grupo
• ultima_mensagem             TEXT
• ultima_mensagem_timestamp   TIMESTAMP
• unread_count                INTEGER DEFAULT 0
• is_archived                 BOOLEAN DEFAULT false
• is_pinned                   BOOLEAN DEFAULT false
• metadata                    JSONB
• created_at                  TIMESTAMP DEFAULT NOW()
• updated_at                  TIMESTAMP DEFAULT NOW()
```

**Regra de negócio:**
- Se `tipo = 'individual'`: `contato_id` é preenchido, `grupo_id` é NULL
- Se `tipo = 'grupo'`: `grupo_id` é preenchido, `contato_id` é NULL

**Relacionamentos:**
- N:1 com `CONTATOS` (muitas conversas para um contato)
- N:1 com `GRUPOS` (muitas conversas para um grupo)
- 1:N com `MENSAGENS` (uma conversa tem várias mensagens)

---

### 📨 MENSAGENS
Armazena todas as mensagens enviadas/recebidas.

```sql
• id                INTEGER PRIMARY KEY
• message_id        VARCHAR(100) UNIQUE             -- ID externo da mensagem
• conversa_id       INTEGER → CONVERSAS(id)
• contato_id        INTEGER → CONTATOS(id)          -- Quem enviou
• tipo_mensagem     VARCHAR(20) DEFAULT 'text'      -- text, image, video, audio, etc
• texto             TEXT
• media_url         TEXT
• media_mime_type   VARCHAR(100)
• caption           TEXT
• is_from_me        BOOLEAN DEFAULT false
• is_forwarded      BOOLEAN DEFAULT false
• quoted_message_id INTEGER → MENSAGENS(id)         -- Mensagem citada
• timestamp         TIMESTAMP NOT NULL
• status            VARCHAR(20) DEFAULT 'sent'      -- sent, delivered, read
• metadata          JSONB
• created_at        TIMESTAMP DEFAULT NOW()

-- Campos para IA/Análise:
• embedding         VECTOR                          -- Embedding vetorial para busca semântica
• sentiment         VARCHAR(20)                     -- positive, negative, neutral
• topics            TEXT[]                          -- Tópicos identificados
• intent            VARCHAR(100)                    -- Intenção do usuário
• entities          JSONB                           -- Entidades extraídas (nomes, datas, etc)
• summary           TEXT                            -- Resumo da mensagem
```

**Relacionamentos:**
- N:1 com `CONVERSAS`
- N:1 com `CONTATOS` (autor da mensagem)
- 1:1 com `MENSAGENS` (mensagem citada - self-reference)
- 1:N com `IA_INTERACOES`

---

## 🤖 2. INTELIGÊNCIA ARTIFICIAL

### 🧠 IA_INTERACOES
Registra cada interação da IA com os usuários.

```sql
• id                    INTEGER PRIMARY KEY
• mensagem_id           INTEGER → MENSAGENS(id)
• conversa_id           INTEGER → CONVERSAS(id)
• prompt_enviado        TEXT                        -- Prompt completo enviado à IA
• resposta_ia           TEXT                        -- Resposta gerada
• modelo                VARCHAR(50)                 -- gpt-4, claude-3, etc
• tokens_usados         INTEGER
• latencia_ms           INTEGER                     -- Tempo de resposta em ms
• conhecimentos_usados  INTEGER[]                   -- IDs de CONHECIMENTO_BASE usados
• mensagens_contexto    INTEGER[]                   -- IDs de mensagens usadas como contexto
• confianca_score       NUMERIC(3,2)                -- 0.00 a 1.00
• feedback_usuario      VARCHAR(20)                 -- thumbs_up, thumbs_down, neutro
• metadata              JSONB
• created_at            TIMESTAMP DEFAULT NOW()
```

**Relacionamentos:**
- N:1 com `MENSAGENS`
- N:1 com `CONVERSAS`
- N:M com `CONHECIMENTO_BASE` (via array de IDs)

---

### 📚 CONHECIMENTO_BASE
Base de conhecimento para a IA (RAG - Retrieval Augmented Generation).

```sql
• id                INTEGER PRIMARY KEY
• titulo            VARCHAR(500) NOT NULL
• conteudo          TEXT NOT NULL
• tipo              VARCHAR(50)                     -- FAQ, manual, politica, procedimento
• categoria         VARCHAR(100)                    -- atendimento, vendas, suporte, etc
• tags              TEXT[]
• embedding         VECTOR                          -- Embedding vetorial para busca
• fonte             VARCHAR(255)                    -- URL ou referência da fonte
• validade_ate      DATE
• prioridade        INTEGER DEFAULT 5               -- 1 (maior) a 10 (menor)
• numero_usos       INTEGER DEFAULT 0               -- Quantas vezes foi usado
• feedback_score    NUMERIC(3,2)                    -- Score baseado em feedback
• is_active         BOOLEAN DEFAULT true
• metadata          JSONB
• created_at        TIMESTAMP DEFAULT NOW()
• updated_at        TIMESTAMP DEFAULT NOW()
```

**Relacionamentos:**
- Referenciado por `IA_INTERACOES.conhecimentos_usados`

---

### 🎓 IA_TREINAMENTO
Pares de pergunta/resposta para treinar e melhorar a IA.

```sql
• id                     INTEGER PRIMARY KEY
• pergunta               TEXT NOT NULL
• resposta               TEXT NOT NULL
• contexto               TEXT
• categoria              VARCHAR(100)
• tags                   TEXT[]
• qualidade_score        NUMERIC(3,2)
• pergunta_embedding     VECTOR
• resposta_embedding     VECTOR
• source_mensagem_id     INTEGER → MENSAGENS(id)    -- Mensagem original (se aplicável)
• aprovado_por           VARCHAR(100)                -- Quem aprovou
• is_aprovado            BOOLEAN DEFAULT false
• numero_usos            INTEGER DEFAULT 0
• metadata               JSONB
• created_at             TIMESTAMP DEFAULT NOW()
```

**Relacionamentos:**
- N:1 com `MENSAGENS` (origem do treinamento)

---

### 💬 CONVERSA_CONTEXTO
Armazena resumos e contexto de períodos de conversas.

```sql
• id                INTEGER PRIMARY KEY
• conversa_id       INTEGER → CONVERSAS(id)
• periodo_inicio    TIMESTAMP NOT NULL
• periodo_fim       TIMESTAMP NOT NULL
• total_mensagens   INTEGER DEFAULT 0
• resumo            TEXT                            -- Resumo automático do período
• temas_principais  TEXT[]                          -- Temas discutidos
• embedding         VECTOR                          -- Embedding do resumo
• metadata          JSONB
• created_at        TIMESTAMP DEFAULT NOW()
```

**Relacionamentos:**
- N:1 com `CONVERSAS`

---

### 📊 IA_METRICAS
Métricas diárias de performance da IA.

```sql
• id                          INTEGER PRIMARY KEY
• data                        DATE UNIQUE NOT NULL
• total_interacoes            INTEGER DEFAULT 0
• tempo_resposta_medio        INTEGER                 -- Média em ms
• taxa_sucesso                NUMERIC(5,2)            -- Percentual
• feedback_positivo           INTEGER DEFAULT 0
• feedback_negativo           INTEGER DEFAULT 0
• tokens_totais               INTEGER DEFAULT 0
• custo_estimado              NUMERIC(10,2)           -- Custo em dólares
• topicos_mais_frequentes     JSONB                   -- {topico: count}
• erros_comuns                JSONB                   -- {erro: count}
• metadata                    JSONB
• created_at                  TIMESTAMP DEFAULT NOW()
```

**Uso:** Agregação diária das métricas de `IA_INTERACOES`

---

## 👥 3. USUÁRIOS

### 👨‍💼 USUARIOS
Usuários do sistema (atendentes, administradores).

```sql
• id             INTEGER PRIMARY KEY
• email          VARCHAR(255) UNIQUE NOT NULL
• password_hash  VARCHAR(255) NOT NULL
• nome           VARCHAR(255) NOT NULL
• avatar         TEXT
• role           VARCHAR(50) DEFAULT 'atendente'     -- admin, supervisor, atendente
• is_active      BOOLEAN DEFAULT true
• last_login     TIMESTAMP
• created_at     TIMESTAMP DEFAULT NOW()
• updated_at     TIMESTAMP DEFAULT NOW()
```

**Roles:**
- `admin`: Acesso total
- `supervisor`: Visualiza métricas e gerencia atendentes
- `atendente`: Responde conversas

---

## 🔗 Diagrama de Relacionamentos

```
┌─────────────┐
│  USUARIOS   │
└─────────────┘

┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  CONTATOS   │────┬───→│  CONVERSAS   │←───┬────│   GRUPOS    │
└─────────────┘    │    └──────────────┘    │    └─────────────┘
      ↓            │            ↓            │           ↑
      │            │            │            │           │
      │            │            ↓            │           │
      │            │    ┌──────────────┐    │    ┌──────────────────┐
      │            └───→│  MENSAGENS   │←───┘    │ GRUPO_PARTICIPAN │
      │                 └──────────────┘         │      TES         │
      │                        ↓                  └──────────────────┘
      │                        │                         ↑    ↑
      │                        ↓                         │    │
      │                 ┌──────────────┐                │    │
      └────────────────→│IA_INTERACOES │                └────┘
                        └──────────────┘
                               ↓
                    ┌──────────┴──────────┐
                    ↓                     ↓
           ┌──────────────────┐  ┌─────────────────┐
           │ CONHECIMENTO_BASE│  │ IA_TREINAMENTO  │
           └──────────────────┘  └─────────────────┘

                    ┌──────────────────┐
                    │ CONVERSA_CONTEXTO│
                    └──────────────────┘
                            ↑
                            │
                    ┌──────────────┐
                    │ IA_METRICAS  │
                    └──────────────┘
```

---

## 📈 Índices Importantes

### Índices Existentes (verificar com EXPLAIN)

```sql
-- CONTATOS
CREATE UNIQUE INDEX idx_contatos_phone ON contatos(phone);

-- GRUPOS
CREATE UNIQUE INDEX idx_grupos_group_id ON grupos(group_id);

-- CONVERSAS
CREATE UNIQUE INDEX idx_conversas_chat_id ON conversas(chat_id);
CREATE INDEX idx_conversas_tipo ON conversas(tipo);
CREATE INDEX idx_conversas_updated_at ON conversas(updated_at DESC);

-- MENSAGENS
CREATE UNIQUE INDEX idx_mensagens_message_id ON mensagens(message_id);
CREATE INDEX idx_mensagens_conversa_id ON mensagens(conversa_id);
CREATE INDEX idx_mensagens_timestamp ON mensagens(timestamp DESC);
CREATE INDEX idx_mensagens_contato_id ON mensagens(contato_id);

-- GRUPO_PARTICIPANTES
CREATE UNIQUE INDEX idx_grupo_part_unique ON grupo_participantes(grupo_id, contato_id);

-- IA_INTERACOES
CREATE INDEX idx_ia_int_mensagem_id ON ia_interacoes(mensagem_id);
CREATE INDEX idx_ia_int_created_at ON ia_interacoes(created_at DESC);

-- CONHECIMENTO_BASE
CREATE INDEX idx_conhec_categoria ON conhecimento_base(categoria);
CREATE INDEX idx_conhec_tags ON conhecimento_base USING GIN(tags);
CREATE INDEX idx_conhec_active ON conhecimento_base(is_active);

-- IA_METRICAS
CREATE UNIQUE INDEX idx_ia_metr_data ON ia_metricas(data);
```

---

## 🔍 Embeddings Vetoriais (pgvector)

As seguintes tabelas usam **embeddings vetoriais** para busca semântica:

1. **MENSAGENS.embedding**: Buscar mensagens similares semanticamente
2. **CONHECIMENTO_BASE.embedding**: RAG - recuperar conhecimento relevante
3. **IA_TREINAMENTO.pergunta_embedding**: Encontrar perguntas similares
4. **IA_TREINAMENTO.resposta_embedding**: Encontrar respostas similares
5. **CONVERSA_CONTEXTO.embedding**: Buscar contextos similares

**Exemplo de busca vetorial:**
```sql
SELECT * FROM conhecimento_base
ORDER BY embedding <-> '[0.1, 0.2, ..., 0.n]'::vector
LIMIT 5;
```

---

## 💾 Estatísticas do Banco

```sql
-- Total de registros por tabela
SELECT
  schemaname,
  tablename,
  n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

-- Tamanho das tabelas
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(tablename::text)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(tablename::text) DESC;
```

---

## 🔐 Considerações de Segurança

1. **Senhas**: Sempre armazenadas como hash (bcrypt/argon2)
2. **JSONB**: Permite flexibilidade sem comprometer estrutura
3. **Índices**: Otimizados para queries frequentes
4. **Timestamps**: Sempre UTC no banco
5. **Soft Delete**: Preferir flags `is_active` ao invés de DELETE

---

## 🚀 Queries Úteis

### Buscar conversas com mensagens não lidas
```sql
SELECT c.*, g.nome as grupo_nome, ct.nome as contato_nome
FROM conversas c
LEFT JOIN grupos g ON c.grupo_id = g.id
LEFT JOIN contatos ct ON c.contato_id = ct.id
WHERE c.unread_count > 0
ORDER BY c.ultima_mensagem_timestamp DESC;
```

### Top 10 grupos mais ativos
```sql
SELECT
  g.nome,
  COUNT(m.id) as total_mensagens,
  MAX(m.timestamp) as ultima_mensagem
FROM grupos g
JOIN conversas c ON c.grupo_id = g.id
JOIN mensagens m ON m.conversa_id = c.id
GROUP BY g.id, g.nome
ORDER BY total_mensagens DESC
LIMIT 10;
```

### Métricas de IA do último mês
```sql
SELECT
  DATE_TRUNC('day', created_at) as dia,
  COUNT(*) as total_interacoes,
  AVG(latencia_ms) as latencia_media,
  SUM(tokens_usados) as tokens_totais,
  AVG(confianca_score) as confianca_media
FROM ia_interacoes
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY dia
ORDER BY dia DESC;
```

---

**Última atualização:** 10/10/2025
**Versão do Schema:** 1.0
**Total de Tabelas:** 11
