-- 007_rollback_classificacao_catalogo_extras.sql

BEGIN;

ALTER TABLE classificacao_catalogo
    DROP CONSTRAINT IF EXISTS classificacao_catalogo_slug_unique;

DROP INDEX IF EXISTS idx_classificacao_catalogo_macro_item;
DROP INDEX IF EXISTS idx_classificacao_catalogo_ativo;
DROP INDEX IF EXISTS idx_classificacao_catalogo_deleted_at;

ALTER TABLE classificacao_catalogo
    DROP COLUMN IF EXISTS slug,
    DROP COLUMN IF EXISTS descricao,
    DROP COLUMN IF EXISTS cor_hex,
    DROP COLUMN IF EXISTS prioridade,
    DROP COLUMN IF EXISTS deleted_at;

ALTER TABLE classificacao_catalogo
    ALTER COLUMN ativo DROP NOT NULL,
    ALTER COLUMN ativo DROP DEFAULT;

COMMIT;
