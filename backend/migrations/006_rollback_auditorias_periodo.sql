-- 006_rollback_auditorias_periodo.sql
-- Rollback para migração de auditorias por período

BEGIN;

DROP VIEW IF EXISTS view_ultima_auditoria_por_conversa;

DROP INDEX IF EXISTS idx_auditorias_status;
DROP INDEX IF EXISTS idx_auditorias_usuario;
DROP INDEX IF EXISTS idx_auditorias_data;
DROP INDEX IF EXISTS idx_auditorias_conversa;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'auditorias_qtd_mensagens_chk'
          AND conrelid = 'auditorias'::regclass
    ) THEN
        ALTER TABLE auditorias DROP CONSTRAINT auditorias_qtd_mensagens_chk;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'auditorias_status_chk'
          AND conrelid = 'auditorias'::regclass
    ) THEN
        ALTER TABLE auditorias DROP CONSTRAINT auditorias_status_chk;
    END IF;
END;
$$;

ALTER TABLE auditorias DROP CONSTRAINT IF EXISTS auditorias_usuario_id_fkey;
ALTER TABLE auditorias DROP CONSTRAINT IF EXISTS auditorias_conversa_id_fkey;

COMMIT;
