-- 005_add_mensagem_classificacao.sql
-- Migração idempotente para classificação de mensagens

BEGIN;

-- ============================================================================
-- Up Migration: estrutura base
-- ============================================================================
CREATE TABLE IF NOT EXISTS mensagem_classificacao (
    id SERIAL PRIMARY KEY,
    mensagem_id INTEGER NOT NULL REFERENCES mensagens(id) ON DELETE CASCADE,
    macro TEXT NOT NULL,
    item TEXT,
    origem TEXT NOT NULL DEFAULT 'manual' CONSTRAINT mensagem_classificacao_origem_chk CHECK (origem IN ('manual', 'sugestao_ia', 'auto_ia')),
    confianca NUMERIC(5,4) DEFAULT 0.0 CONSTRAINT mensagem_classificacao_confianca_chk CHECK (confianca >= 0 AND confianca <= 1),
    observacoes TEXT,
    criado_por INTEGER REFERENCES usuarios(id),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT mensagem_classificacao_mensagem_id_uk UNIQUE (mensagem_id)
);

-- ============================================================================
-- Harmonização de esquemas legados
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'mensagem_classificacao'
          AND column_name = 'message_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'mensagem_classificacao'
          AND column_name = 'mensagem_id'
    ) THEN
        ALTER TABLE mensagem_classificacao RENAME COLUMN message_id TO mensagem_id;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'mensagem_classificacao'
          AND column_name = 'user_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'mensagem_classificacao'
          AND column_name = 'criado_por'
    ) THEN
        ALTER TABLE mensagem_classificacao RENAME COLUMN user_id TO criado_por;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'mensagem_classificacao'
          AND column_name = 'comentario'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'mensagem_classificacao'
          AND column_name = 'observacoes'
    ) THEN
        ALTER TABLE mensagem_classificacao RENAME COLUMN comentario TO observacoes;
    END IF;
END;
$$;

ALTER TABLE mensagem_classificacao DROP COLUMN IF EXISTS conversa_id;

ALTER TABLE mensagem_classificacao
    ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE mensagem_classificacao
    ADD COLUMN IF NOT EXISTS confianca NUMERIC(5,4) DEFAULT 0.0;

ALTER TABLE mensagem_classificacao
    ADD COLUMN IF NOT EXISTS observacoes TEXT;

ALTER TABLE mensagem_classificacao
    ADD COLUMN IF NOT EXISTS criado_por INTEGER;

ALTER TABLE mensagem_classificacao
    ALTER COLUMN item DROP NOT NULL;

ALTER TABLE mensagem_classificacao
    ALTER COLUMN confianca TYPE NUMERIC(5,4);

ALTER TABLE mensagem_classificacao
    ALTER COLUMN confianca SET DEFAULT 0.0;

ALTER TABLE mensagem_classificacao
    ALTER COLUMN origem SET DEFAULT 'manual';

ALTER TABLE mensagem_classificacao
    ALTER COLUMN origem SET NOT NULL;

ALTER TABLE mensagem_classificacao
    ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE mensagem_classificacao
    ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE mensagem_classificacao
    ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE mensagem_classificacao
    ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'mensagem_classificacao_message_unique'
          AND conrelid = 'mensagem_classificacao'::regclass
    ) THEN
        ALTER TABLE mensagem_classificacao
            RENAME CONSTRAINT mensagem_classificacao_message_unique TO mensagem_classificacao_mensagem_id_uk;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'mensagem_classificacao'::regclass
          AND contype = 'u'
          AND pg_get_constraintdef(oid) = 'UNIQUE (mensagem_id)'
    ) THEN
        ALTER TABLE mensagem_classificacao
            ADD CONSTRAINT mensagem_classificacao_mensagem_id_uk UNIQUE (mensagem_id);
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'mensagem_classificacao_user_id_fkey'
          AND conrelid = 'mensagem_classificacao'::regclass
    ) THEN
        ALTER TABLE mensagem_classificacao
            RENAME CONSTRAINT mensagem_classificacao_user_id_fkey TO mensagem_classificacao_criado_por_fkey;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'mensagem_classificacao'::regclass
          AND contype = 'f'
          AND conname = 'mensagem_classificacao_criado_por_fkey'
    ) THEN
        ALTER TABLE mensagem_classificacao
            ADD CONSTRAINT mensagem_classificacao_criado_por_fkey
            FOREIGN KEY (criado_por) REFERENCES usuarios(id);
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'mensagem_classificacao'::regclass
          AND conname = 'mensagem_classificacao_origem_chk'
    ) THEN
        ALTER TABLE mensagem_classificacao
            ADD CONSTRAINT mensagem_classificacao_origem_chk
            CHECK (origem IN ('manual', 'sugestao_ia', 'auto_ia'));
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'mensagem_classificacao'::regclass
          AND conname = 'mensagem_classificacao_confianca_chk'
    ) THEN
        ALTER TABLE mensagem_classificacao
            ADD CONSTRAINT mensagem_classificacao_confianca_chk
            CHECK (confianca >= 0 AND confianca <= 1);
    END IF;
END;
$$;

-- ============================================================================
-- Índices de apoio
-- ============================================================================
DROP INDEX IF EXISTS idx_mensagem_classificacao_conversa;
DROP INDEX IF EXISTS idx_mensagem_classificacao_user;
DROP INDEX IF EXISTS idx_mensagem_classificacao_macro_item;

CREATE INDEX IF NOT EXISTS idx_mensagem_classificacao_msg
    ON mensagem_classificacao(mensagem_id);

CREATE INDEX IF NOT EXISTS idx_mensagem_classificacao_macro
    ON mensagem_classificacao(macro);

-- ============================================================================
-- Trigger de atualização automática
-- ============================================================================
DROP TRIGGER IF EXISTS trg_mensagem_classificacao_updated_at ON mensagem_classificacao;
CREATE TRIGGER trg_mensagem_classificacao_updated_at
    BEFORE UPDATE ON mensagem_classificacao
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Visões de apoio analítico
-- ============================================================================
DROP VIEW IF EXISTS vw_mensagens_sem_classificacao;
CREATE OR REPLACE VIEW vw_mensagens_sem_classificacao AS
SELECT
    m.id,
    m.conversa_id,
    m.contato_id,
    m.texto,
    m.timestamp
FROM mensagens m
LEFT JOIN mensagem_classificacao mc
    ON mc.mensagem_id = m.id
WHERE mc.id IS NULL
  AND m.timestamp >= NOW() - INTERVAL '30 days';

DROP VIEW IF EXISTS vw_classificacao_qualidade_7d;
CREATE OR REPLACE VIEW vw_classificacao_qualidade_7d AS
SELECT
    mc.macro,
    mc.item,
    mc.origem,
    COUNT(*) AS total,
    AVG(COALESCE(mc.confianca, 0.0)) AS media_confianca
FROM mensagem_classificacao mc
WHERE mc.created_at >= NOW() - INTERVAL '7 days'
GROUP BY mc.macro, mc.item, mc.origem;

COMMIT;

-- ============================================================================
-- Down Migration (executar manualmente em caso de rollback)
-- ============================================================================
-- BEGIN;
-- DROP VIEW IF EXISTS vw_classificacao_qualidade_7d;
-- DROP VIEW IF EXISTS vw_mensagens_sem_classificacao;
-- DROP TRIGGER IF EXISTS trg_mensagem_classificacao_updated_at ON mensagem_classificacao;
-- DROP TABLE IF EXISTS mensagem_classificacao;
-- COMMIT;
