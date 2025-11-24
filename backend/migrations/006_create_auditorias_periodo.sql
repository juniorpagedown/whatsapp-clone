-- 006_create_auditorias_periodo.sql
-- Estrutura de auditorias por período e visão auxiliar para últimas auditorias concluídas

BEGIN;

-- ============================================================================
-- Tabela principal de auditorias por período (idempotente)
-- ============================================================================
CREATE TABLE IF NOT EXISTS auditorias (
    id SERIAL PRIMARY KEY,
    conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
    data_inicio TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    data_fim TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    qtd_mensagens INTEGER NOT NULL DEFAULT 0,
    observacao TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'concluida',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Harmonização de esquemas preexistentes
-- ============================================================================

DO $$
BEGIN
    -- started_at -> data_inicio
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'auditorias'
          AND column_name = 'data_inicio'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'auditorias'
          AND column_name = 'started_at'
    ) THEN
        ALTER TABLE auditorias RENAME COLUMN started_at TO data_inicio;
    END IF;

    -- finalized_at -> data_fim
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'auditorias'
          AND column_name = 'data_fim'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'auditorias'
          AND column_name = 'finalized_at'
    ) THEN
        ALTER TABLE auditorias RENAME COLUMN finalized_at TO data_fim;
    END IF;

    -- auditor_user_id -> usuario_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'auditorias'
          AND column_name = 'usuario_id'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'auditorias'
          AND column_name = 'auditor_user_id'
    ) THEN
        ALTER TABLE auditorias RENAME COLUMN auditor_user_id TO usuario_id;
    END IF;

    -- notes -> observacao
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'auditorias'
          AND column_name = 'observacao'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'auditorias'
          AND column_name = 'notes'
    ) THEN
        ALTER TABLE auditorias RENAME COLUMN notes TO observacao;
    END IF;
END;
$$;

ALTER TABLE auditorias
    ADD COLUMN IF NOT EXISTS data_inicio TIMESTAMP WITHOUT TIME ZONE,
    ADD COLUMN IF NOT EXISTS data_fim TIMESTAMP WITHOUT TIME ZONE,
    ADD COLUMN IF NOT EXISTS usuario_id INTEGER,
    ADD COLUMN IF NOT EXISTS qtd_mensagens INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS observacao TEXT,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'concluida',
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW();

ALTER TABLE auditorias
    ALTER COLUMN qtd_mensagens SET DEFAULT 0;

UPDATE auditorias
   SET data_inicio = COALESCE(data_inicio, NOW())
 WHERE data_inicio IS NULL;

UPDATE auditorias
   SET data_fim = data_inicio
 WHERE data_fim IS NULL;

UPDATE auditorias
   SET status = COALESCE(status, 'concluida')
 WHERE status IS NULL;

UPDATE auditorias
   SET metadata = COALESCE(metadata, '{}'::jsonb);

-- Assegura integridade referencial após renomes
ALTER TABLE auditorias
    ALTER COLUMN conversa_id SET NOT NULL,
    ALTER COLUMN data_inicio SET NOT NULL,
    ALTER COLUMN data_fim SET NOT NULL,
    ALTER COLUMN usuario_id SET NOT NULL,
    ALTER COLUMN qtd_mensagens SET NOT NULL,
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'auditorias_usuario_id_fkey'
          AND conrelid = 'auditorias'::regclass
    ) THEN
        ALTER TABLE auditorias
            ADD CONSTRAINT auditorias_usuario_id_fkey
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'auditorias_conversa_id_fkey'
          AND conrelid = 'auditorias'::regclass
    ) THEN
        ALTER TABLE auditorias
            ADD CONSTRAINT auditorias_conversa_id_fkey
            FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'auditorias_status_chk'
          AND conrelid = 'auditorias'::regclass
    ) THEN
        ALTER TABLE auditorias
            ADD CONSTRAINT auditorias_status_chk
            CHECK (status IN ('concluida', 'reaberta', 'cancelada'));
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'auditorias_qtd_mensagens_chk'
          AND conrelid = 'auditorias'::regclass
    ) THEN
        ALTER TABLE auditorias
            ADD CONSTRAINT auditorias_qtd_mensagens_chk
            CHECK (qtd_mensagens >= 0);
    END IF;
END;
$$;

-- ============================================================================
-- Índices
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_auditorias_conversa ON auditorias(conversa_id, data_fim DESC);
CREATE INDEX IF NOT EXISTS idx_auditorias_data ON auditorias(data_inicio, data_fim);
CREATE INDEX IF NOT EXISTS idx_auditorias_usuario ON auditorias(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditorias_status ON auditorias(status);

-- ============================================================================
-- Visão auxiliar para última auditoria concluída por conversa
-- ============================================================================
CREATE OR REPLACE VIEW view_ultima_auditoria_por_conversa AS
SELECT a.conversa_id,
       MAX(a.data_fim) AS ultima_data_fim
  FROM auditorias AS a
 WHERE a.status = 'concluida'
 GROUP BY a.conversa_id;

COMMIT;
