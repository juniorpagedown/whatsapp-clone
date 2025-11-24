-- ============================================================================
-- Rollback Migration 004
-- ============================================================================

BEGIN;

DROP INDEX IF EXISTS idx_conversa_contexto_embedding_ivfflat;
DROP INDEX IF EXISTS idx_classificacao_catalogo_embedding_ivfflat;
DROP INDEX IF EXISTS idx_mensagens_embedding_ivfflat;

ALTER TABLE classificacao_catalogo
    DROP COLUMN IF EXISTS embedding;

COMMIT;
