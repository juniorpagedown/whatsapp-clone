-- Atualiza conversas para suportar status de auditoria
ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS is_auditada BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auditada_em TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS auditada_por INT NULL REFERENCES usuarios(id);

CREATE INDEX IF NOT EXISTS idx_conversas_is_auditada ON conversas(is_auditada, COALESCE(ultima_mensagem_timestamp, updated_at) DESC);

-- Sincroniza estado inicial com auditorias já finalizadas
WITH latest_audits AS (
  SELECT DISTINCT ON (conversa_id)
         conversa_id,
         finalized_at,
         finalized_by
    FROM auditorias
   WHERE finalized_at IS NOT NULL
   ORDER BY conversa_id, finalized_at DESC
)
UPDATE conversas c
   SET is_auditada = TRUE,
       auditada_em = la.finalized_at,
       auditada_por = la.finalized_by
  FROM latest_audits la
 WHERE c.id = la.conversa_id;
