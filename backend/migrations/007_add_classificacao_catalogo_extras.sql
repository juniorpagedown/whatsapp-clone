-- 007_add_classificacao_catalogo_extras.sql
-- Migração idempotente para atributos adicionais do catálogo de classificação

BEGIN;

-- Garantir dependências para manipulação de strings sem acentos
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Adicionar colunas extras, garantindo existência
ALTER TABLE classificacao_catalogo
    ADD COLUMN IF NOT EXISTS slug TEXT,
    ADD COLUMN IF NOT EXISTS descricao TEXT,
    ADD COLUMN IF NOT EXISTS cor_hex TEXT,
    ADD COLUMN IF NOT EXISTS prioridade INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Garantir defaults e constraints consistentes
ALTER TABLE classificacao_catalogo
    ALTER COLUMN prioridade SET DEFAULT 0;

UPDATE classificacao_catalogo
   SET prioridade = 0
 WHERE prioridade IS NULL;

ALTER TABLE classificacao_catalogo
    ALTER COLUMN prioridade SET NOT NULL;

ALTER TABLE classificacao_catalogo
    ALTER COLUMN ativo SET DEFAULT TRUE;

UPDATE classificacao_catalogo
   SET ativo = TRUE
 WHERE ativo IS NULL;

ALTER TABLE classificacao_catalogo
    ALTER COLUMN ativo SET NOT NULL;

-- Popular slug base quando ausente
WITH base AS (
    SELECT
        id,
        trim(both '-' FROM regexp_replace(
            lower(unaccent(concat_ws(' ', macro, item))),
            '[^a-z0-9]+',
            '-',
            'g'
        )) AS base_slug
    FROM classificacao_catalogo
)
UPDATE classificacao_catalogo AS c
   SET slug = COALESCE(NULLIF(base.base_slug, ''), concat('classificacao-', c.id))
  FROM base
 WHERE c.id = base.id
   AND (c.slug IS NULL OR c.slug = '');

-- Resolver colisões de slug (gerando sufixos incrementais)
WITH duplicates AS (
    SELECT
        id,
        slug,
        ROW_NUMBER() OVER (PARTITION BY slug ORDER BY id) AS rn
    FROM classificacao_catalogo
    WHERE slug IS NOT NULL
)
UPDATE classificacao_catalogo AS c
   SET slug = concat(c.slug, '-', duplicates.rn)
  FROM duplicates
 WHERE c.id = duplicates.id
   AND duplicates.rn > 1;

-- Revalidar unicidade de slug
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'classificacao_catalogo'::regclass
           AND conname = 'classificacao_catalogo_slug_unique'
    ) THEN
        ALTER TABLE classificacao_catalogo
            DROP CONSTRAINT classificacao_catalogo_slug_unique;
    END IF;
END;
$$;

ALTER TABLE classificacao_catalogo
    ALTER COLUMN slug SET NOT NULL;

ALTER TABLE classificacao_catalogo
    ADD CONSTRAINT classificacao_catalogo_slug_unique UNIQUE (slug);

-- Índices de apoio
CREATE INDEX IF NOT EXISTS idx_classificacao_catalogo_macro_item
    ON classificacao_catalogo (macro, item);

CREATE INDEX IF NOT EXISTS idx_classificacao_catalogo_ativo
    ON classificacao_catalogo (ativo);

CREATE INDEX IF NOT EXISTS idx_classificacao_catalogo_deleted_at
    ON classificacao_catalogo (deleted_at);

COMMIT;
