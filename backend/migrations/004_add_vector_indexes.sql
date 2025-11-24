-- ============================================================================
-- Migration 004: Índices vetoriais para busca híbrida
-- ============================================================================

BEGIN;

-- Garantir coluna de embedding no catálogo
ALTER TABLE classificacao_catalogo
    ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Mensagens
CREATE INDEX IF NOT EXISTS idx_mensagens_embedding_ivfflat
    ON mensagens
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Catálogo de classificação
CREATE INDEX IF NOT EXISTS idx_classificacao_catalogo_embedding_ivfflat
    ON classificacao_catalogo
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Contexto de conversas
CREATE INDEX IF NOT EXISTS idx_conversa_contexto_embedding_ivfflat
    ON conversa_contexto
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

COMMIT;
