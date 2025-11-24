-- Drop old index
DROP INDEX IF EXISTS idx_mensagens_timestamp;

-- Add new optimized indexes
CREATE INDEX IF NOT EXISTS idx_mensagens_timestamp_id ON mensagens(timestamp DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa_timestamp ON mensagens(conversa_id, timestamp DESC);
