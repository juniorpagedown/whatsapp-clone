-- ============================================================================
-- Rollback Migration 003
-- ============================================================================

BEGIN;

DROP INDEX IF EXISTS idx_conversas_macro_item;
ALTER TABLE conversas
    DROP COLUMN IF EXISTS classificado_em,
    DROP COLUMN IF EXISTS classificado_por,
    DROP COLUMN IF EXISTS item,
    DROP COLUMN IF EXISTS macro;

DROP INDEX IF EXISTS idx_conversa_classificacao_macro_item;
DROP INDEX IF EXISTS idx_conversa_classificacao_conversa_created;
DROP TABLE IF EXISTS conversa_classificacao;

DROP TRIGGER IF EXISTS trg_classificacao_catalogo_updated_at ON classificacao_catalogo;
DROP FUNCTION IF EXISTS update_classificacao_catalogo_updated_at;
DROP INDEX IF EXISTS idx_classificacao_catalogo_ativo;
DROP TABLE IF EXISTS classificacao_catalogo;

COMMIT;
