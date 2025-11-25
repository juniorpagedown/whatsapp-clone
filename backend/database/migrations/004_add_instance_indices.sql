-- Add indices for instance_id on core tables if they don't exist
CREATE INDEX IF NOT EXISTS idx_contatos_instance_id ON contatos(instance_id);
CREATE INDEX IF NOT EXISTS idx_conversas_instance_id ON conversas(instance_id);

-- Composite indices for common queries
CREATE INDEX IF NOT EXISTS idx_conversas_instance_updated ON conversas(instance_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mensagens_instance_timestamp ON mensagens(instance_id, timestamp DESC);
