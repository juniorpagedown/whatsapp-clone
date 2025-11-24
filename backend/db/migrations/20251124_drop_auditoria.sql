-- Remove auditoria feature (tables/views/columns)
DROP VIEW IF EXISTS view_ultima_auditoria_por_conversa;
DROP TABLE IF EXISTS auditorias CASCADE;

ALTER TABLE IF EXISTS conversas
  DROP COLUMN IF EXISTS is_auditada,
  DROP COLUMN IF EXISTS auditada_em,
  DROP COLUMN IF EXISTS auditada_por;
