-- Drop new optimized indexes
DROP INDEX IF EXISTS idx_mensagens_timestamp_id;
DROP INDEX IF EXISTS idx_mensagens_conversa_timestamp;

-- Recreate old index
CREATE INDEX IF NOT EXISTS idx_mensagens_timestamp ON mensagens(timestamp DESC);
