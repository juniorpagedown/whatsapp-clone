-- ============================================================================
-- Migration 003: Sistema de Classificação Hierárquica para Conversas
-- Descrição: Cria catálogo de classificação, histórico de classificações e
--            adiciona snapshot de classificação na tabela de conversas.
-- Data: 2025-02-23
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CATÁLOGO DE CLASSIFICAÇÃO
-- ============================================================================
CREATE TABLE IF NOT EXISTS classificacao_catalogo (
    id SERIAL PRIMARY KEY,
    macro VARCHAR(150) NOT NULL,
    item VARCHAR(200) NOT NULL,
    pos JSONB DEFAULT '[]'::jsonb,
    neg JSONB DEFAULT '[]'::jsonb,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT classificacao_catalogo_macro_item_unique UNIQUE (macro, item)
);

COMMENT ON TABLE classificacao_catalogo IS 'Catálogo de regras de classificação automática para conversas';
COMMENT ON COLUMN classificacao_catalogo.pos IS 'Lista de palavras-chave positivas (JSON array)';
COMMENT ON COLUMN classificacao_catalogo.neg IS 'Lista de palavras-chave negativas (JSON array)';

CREATE INDEX IF NOT EXISTS idx_classificacao_catalogo_ativo
    ON classificacao_catalogo(ativo) WHERE ativo = TRUE;

CREATE OR REPLACE FUNCTION update_classificacao_catalogo_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_classificacao_catalogo_updated_at ON classificacao_catalogo;
CREATE TRIGGER trg_classificacao_catalogo_updated_at
    BEFORE UPDATE ON classificacao_catalogo
    FOR EACH ROW
    EXECUTE FUNCTION update_classificacao_catalogo_updated_at();

-- ============================================================================
-- 2. HISTÓRICO DE CLASSIFICAÇÕES POR CONVERSA
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversa_classificacao (
    id SERIAL PRIMARY KEY,
    conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
    macro VARCHAR(150) NOT NULL,
    item VARCHAR(200) NOT NULL,
    origem VARCHAR(50) DEFAULT 'manual',
    confianca SMALLINT CHECK (confianca BETWEEN 0 AND 100),
    criado_por VARCHAR(120),
    criado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE conversa_classificacao IS 'Histórico de classificações aplicadas às conversas';
COMMENT ON COLUMN conversa_classificacao.origem IS 'Origem da classificação (manual, sugestao, importacao, etc)';
COMMENT ON COLUMN conversa_classificacao.confianca IS 'Score de confiança (0-100)';

CREATE INDEX IF NOT EXISTS idx_conversa_classificacao_conversa_created
    ON conversa_classificacao(conversa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_conversa_classificacao_macro_item
    ON conversa_classificacao(macro, item);

-- ============================================================================
-- 3. SNAPSHOT DE CLASSIFICAÇÃO NA TABELA CONVERSAS
-- ============================================================================
ALTER TABLE conversas
    ADD COLUMN IF NOT EXISTS macro VARCHAR(150),
    ADD COLUMN IF NOT EXISTS item VARCHAR(200),
    ADD COLUMN IF NOT EXISTS classificado_por VARCHAR(120),
    ADD COLUMN IF NOT EXISTS classificado_em TIMESTAMP WITHOUT TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_conversas_macro_item
    ON conversas(macro, item);

COMMIT;
