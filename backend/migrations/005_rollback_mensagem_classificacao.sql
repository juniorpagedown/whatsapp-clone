-- 005_rollback_mensagem_classificacao.sql
-- Remove tabela de classificação por mensagem

BEGIN;

DROP TRIGGER IF EXISTS trg_mensagem_classificacao_updated_at ON mensagem_classificacao;
DROP TABLE IF EXISTS mensagem_classificacao;

COMMIT;
