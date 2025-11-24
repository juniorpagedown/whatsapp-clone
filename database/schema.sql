-- Schema PostgreSQL para WhatsApp Clone com pgvector
-- Execute este script no PostgreSQL após instalar a extensão pgvector

-- Habilitar extensão pgvector para embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'atendente',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_usuarios_email ON usuarios(email);


-- Tabela de contatos
CREATE TABLE IF NOT EXISTS contatos (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    nome VARCHAR(255) NOT NULL,
    avatar TEXT,
    profile_pic_url TEXT,
    status_text TEXT,
    is_business BOOLEAN DEFAULT FALSE,
    labels TEXT[],
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_interaction TIMESTAMP
);

CREATE INDEX idx_contatos_phone ON contatos(phone);
CREATE INDEX idx_contatos_nome ON contatos USING gin(to_tsvector('portuguese', nome));
CREATE INDEX idx_contatos_last_interaction ON contatos(last_interaction DESC);

-- Tabela de grupos
CREATE TABLE IF NOT EXISTS grupos (
    id SERIAL PRIMARY KEY,
    group_id VARCHAR(100) UNIQUE NOT NULL,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    avatar TEXT,
    created_by VARCHAR(20),
    participant_count INTEGER DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_grupos_group_id ON grupos(group_id);
CREATE INDEX idx_grupos_nome ON grupos USING gin(to_tsvector('portuguese', nome));

-- Tabela de participantes de grupos
CREATE TABLE IF NOT EXISTS grupo_participantes (
    id SERIAL PRIMARY KEY,
    grupo_id INTEGER REFERENCES grupos(id) ON DELETE CASCADE,
    contato_id INTEGER REFERENCES contatos(id) ON DELETE CASCADE,
    is_admin BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP,
    UNIQUE(grupo_id, contato_id)
);

CREATE INDEX idx_grupo_participantes_grupo ON grupo_participantes(grupo_id);
CREATE INDEX idx_grupo_participantes_contato ON grupo_participantes(contato_id);

-- Tabela de conversas
CREATE TABLE IF NOT EXISTS conversas (
    id SERIAL PRIMARY KEY,
    chat_id VARCHAR(100) UNIQUE NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    contato_id INTEGER REFERENCES contatos(id) ON DELETE SET NULL,
    grupo_id INTEGER REFERENCES grupos(id) ON DELETE SET NULL,
    ultima_mensagem TEXT,
    ultima_mensagem_timestamp TIMESTAMP,
    unread_count INTEGER DEFAULT 0,
    is_archived BOOLEAN DEFAULT FALSE,
    is_pinned BOOLEAN DEFAULT FALSE,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tipo_conversa CHECK (tipo IN ('individual', 'grupo')),
    CONSTRAINT conversa_valida CHECK (
        (tipo = 'individual' AND contato_id IS NOT NULL AND grupo_id IS NULL) OR
        (tipo = 'grupo' AND grupo_id IS NOT NULL AND contato_id IS NULL)
    )
);

CREATE INDEX idx_conversas_chat_id ON conversas(chat_id);
CREATE INDEX idx_conversas_tipo ON conversas(tipo);
CREATE INDEX idx_conversas_ultima_mensagem ON conversas(ultima_mensagem_timestamp DESC);


-- Tabela de mensagens (principal)
CREATE TABLE IF NOT EXISTS mensagens (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(100) UNIQUE,
    conversa_id INTEGER REFERENCES conversas(id) ON DELETE CASCADE,
    contato_id INTEGER REFERENCES contatos(id) ON DELETE SET NULL,
    tipo_mensagem VARCHAR(20) DEFAULT 'text',
    texto TEXT,
    media_url TEXT,
    media_mime_type VARCHAR(100),
    caption TEXT,
    is_from_me BOOLEAN DEFAULT FALSE,
    is_forwarded BOOLEAN DEFAULT FALSE,
    quoted_message_id INTEGER REFERENCES mensagens(id),
    timestamp TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'sent',
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    embedding vector(1536),
    sentiment VARCHAR(20),
    topics TEXT[],
    intent VARCHAR(100),
    entities JSONB,
    summary TEXT
);

CREATE INDEX idx_mensagens_conversa ON mensagens(conversa_id);
CREATE INDEX idx_mensagens_contato ON mensagens(contato_id);
CREATE INDEX idx_mensagens_timestamp_id ON mensagens(timestamp DESC, id DESC);
CREATE INDEX idx_mensagens_conversa_timestamp ON mensagens(conversa_id, timestamp DESC);
CREATE INDEX idx_mensagens_tipo ON mensagens(tipo_mensagem);
CREATE INDEX idx_mensagens_texto ON mensagens USING gin(to_tsvector('portuguese', texto));
CREATE INDEX idx_mensagens_embedding ON mensagens USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_mensagens_embedding_ivfflat ON mensagens USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Tabela de contexto de conversas
CREATE TABLE IF NOT EXISTS conversa_contexto (
    id SERIAL PRIMARY KEY,
    conversa_id INTEGER REFERENCES conversas(id) ON DELETE CASCADE,
    periodo_inicio TIMESTAMP NOT NULL,
    periodo_fim TIMESTAMP NOT NULL,
    total_mensagens INTEGER DEFAULT 0,
    resumo TEXT,
    temas_principais TEXT[],
    embedding vector(1536),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contexto_conversa ON conversa_contexto(conversa_id);
CREATE INDEX idx_contexto_periodo ON conversa_contexto(periodo_inicio, periodo_fim);
CREATE INDEX idx_contexto_embedding ON conversa_contexto USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_conversa_contexto_embedding_ivfflat ON conversa_contexto USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Tabela de conhecimento base
CREATE TABLE IF NOT EXISTS conhecimento_base (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(500) NOT NULL,
    conteudo TEXT NOT NULL,
    tipo VARCHAR(50),
    categoria VARCHAR(100),
    tags TEXT[],
    embedding vector(1536),
    fonte VARCHAR(255),
    validade_ate DATE,
    prioridade INTEGER DEFAULT 5,
    numero_usos INTEGER DEFAULT 0,
    feedback_score NUMERIC(3,2),
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conhecimento_tipo ON conhecimento_base(tipo);
CREATE INDEX idx_conhecimento_categoria ON conhecimento_base(categoria);
CREATE INDEX idx_conhecimento_tags ON conhecimento_base USING gin(tags);
CREATE INDEX idx_conhecimento_embedding ON conhecimento_base USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_conhecimento_ativo ON conhecimento_base(is_active) WHERE is_active = TRUE;

-- Tabela de interações com IA
CREATE TABLE IF NOT EXISTS ia_interacoes (
    id SERIAL PRIMARY KEY,
    mensagem_id INTEGER REFERENCES mensagens(id) ON DELETE CASCADE,
    conversa_id INTEGER REFERENCES conversas(id) ON DELETE CASCADE,
    prompt_enviado TEXT,
    resposta_ia TEXT,
    modelo VARCHAR(50),
    tokens_usados INTEGER,
    latencia_ms INTEGER,
    conhecimentos_usados INTEGER[],
    mensagens_contexto INTEGER[],
    confianca_score NUMERIC(3,2),
    feedback_usuario VARCHAR(20),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ia_mensagem ON ia_interacoes(mensagem_id);
CREATE INDEX idx_ia_conversa ON ia_interacoes(conversa_id);
CREATE INDEX idx_ia_created ON ia_interacoes(created_at DESC);
CREATE INDEX idx_ia_modelo ON ia_interacoes(modelo);

-- Tabela de treinamento da IA
CREATE TABLE IF NOT EXISTS ia_treinamento (
    id SERIAL PRIMARY KEY,
    pergunta TEXT NOT NULL,
    resposta TEXT NOT NULL,
    contexto TEXT,
    categoria VARCHAR(100),
    tags TEXT[],
    qualidade_score NUMERIC(3,2),
    pergunta_embedding vector(1536),
    resposta_embedding vector(1536),
    source_mensagem_id INTEGER REFERENCES mensagens(id),
    aprovado_por VARCHAR(100),
    is_aprovado BOOLEAN DEFAULT FALSE,
    numero_usos INTEGER DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_treinamento_categoria ON ia_treinamento(categoria);
CREATE INDEX idx_treinamento_aprovado ON ia_treinamento(is_aprovado) WHERE is_aprovado = TRUE;
CREATE INDEX idx_treinamento_pergunta_emb ON ia_treinamento USING hnsw (pergunta_embedding vector_cosine_ops);

-- Tabela de métricas de performance da IA
CREATE TABLE IF NOT EXISTS ia_metricas (
    id SERIAL PRIMARY KEY,
    data DATE NOT NULL,
    total_interacoes INTEGER DEFAULT 0,
    tempo_resposta_medio INTEGER,
    taxa_sucesso NUMERIC(5,2),
    feedback_positivo INTEGER DEFAULT 0,
    feedback_negativo INTEGER DEFAULT 0,
    tokens_totais INTEGER DEFAULT 0,
    custo_estimado NUMERIC(10,2),
    topicos_mais_frequentes JSONB,
    erros_comuns JSONB,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(data)
);

CREATE INDEX idx_metricas_data ON ia_metricas(data DESC);

-- Função para busca semântica de mensagens
CREATE OR REPLACE FUNCTION buscar_mensagens_similares(
    query_embedding vector(1536),
    limite INTEGER DEFAULT 10,
    similarity_threshold NUMERIC DEFAULT 0.7
)
RETURNS TABLE (
    id INTEGER,
    texto TEXT,
    data_envio TIMESTAMP,
    conversa_nome TEXT,
    similarity NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.texto,
        m.timestamp as data_envio,
        CASE 
            WHEN c.tipo = 'individual' THEN cont.nome
            WHEN c.tipo = 'grupo' THEN g.nome
        END as conversa_nome,
        1 - (m.embedding <=> query_embedding) as similarity
    FROM mensagens m
    JOIN conversas c ON m.conversa_id = c.id
    LEFT JOIN contatos cont ON c.contato_id = cont.id
    LEFT JOIN grupos g ON c.grupo_id = g.id
    WHERE m.embedding IS NOT NULL
        AND 1 - (m.embedding <=> query_embedding) > similarity_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT limite;
END;
$$ LANGUAGE plpgsql;

-- Função para buscar conhecimento relevante
CREATE OR REPLACE FUNCTION buscar_conhecimento_relevante(
    query_embedding vector(1536),
    limite INTEGER DEFAULT 5
)
RETURNS TABLE (
    id INTEGER,
    titulo VARCHAR(500),
    conteudo TEXT,
    tipo VARCHAR(50),
    similarity NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        kb.id,
        kb.titulo,
        kb.conteudo,
        kb.tipo,
        1 - (kb.embedding <=> query_embedding) as similarity
    FROM conhecimento_base kb
    WHERE kb.is_active = TRUE
        AND kb.embedding IS NOT NULL
    ORDER BY kb.embedding <=> query_embedding
    LIMIT limite;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_contatos_updated_at BEFORE UPDATE ON contatos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_grupos_updated_at BEFORE UPDATE ON grupos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversas_updated_at BEFORE UPDATE ON conversas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inserir dados de exemplo na base de conhecimento
INSERT INTO conhecimento_base (titulo, conteudo, tipo, categoria, tags) VALUES
('Horário de Atendimento', 'Nosso horário de atendimento é de segunda a sexta, das 9h às 18h. Fora desse horário, você pode deixar uma mensagem que responderemos assim que possível.', 'faq', 'atendimento', ARRAY['horário', 'atendimento', 'funcionamento']),
('Política de Devolução', 'Você tem até 30 dias após a compra para solicitar a devolução do produto. O produto deve estar sem uso e na embalagem original. Entre em contato conosco para iniciar o processo.', 'política', 'vendas', ARRAY['devolução', 'troca', 'garantia']),
('Como Fazer Pedido', 'Para fazer um pedido: 1) Envie o código ou nome do produto, 2) Confirme a quantidade, 3) Informe o endereço de entrega, 4) Escolha a forma de pagamento.', 'procedimento', 'vendas', ARRAY['pedido', 'compra', 'como fazer'])
ON CONFLICT DO NOTHING;
