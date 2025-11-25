BEGIN;

-- 1. Create Instances Table
CREATE TABLE IF NOT EXISTS whatsapp_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    instance_key VARCHAR(255) NOT NULL UNIQUE,
    webhook_url VARCHAR(255),
    status VARCHAR(50) DEFAULT 'disconnected',
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Create Default Instance (Idempotent)
-- We use 'default' as key initially, user can update it later to match their actual Evolution instance name
INSERT INTO whatsapp_instances (name, instance_key, status)
VALUES ('Default Instance', 'default', 'connected')
ON CONFLICT (instance_key) DO NOTHING;

-- Capture the default instance ID and migrate data
DO $$
DECLARE
    default_instance_id UUID;
BEGIN
    SELECT id INTO default_instance_id FROM whatsapp_instances WHERE instance_key = 'default';

    -- 3. Update Contatos
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contatos' AND column_name = 'instance_id') THEN
        ALTER TABLE contatos ADD COLUMN instance_id UUID REFERENCES whatsapp_instances(id);
        UPDATE contatos SET instance_id = default_instance_id WHERE instance_id IS NULL;
        ALTER TABLE contatos ALTER COLUMN instance_id SET NOT NULL;
        
        -- Drop old constraint and add new one
        -- Note: We assume the constraint name is 'contatos_phone_key'. If it's different, this might fail, 
        -- but 'contatos_phone_key' is the default for UNIQUE(phone).
        ALTER TABLE contatos DROP CONSTRAINT IF EXISTS contatos_phone_key;
        ALTER TABLE contatos ADD CONSTRAINT contatos_instance_phone_key UNIQUE (instance_id, phone);
    END IF;

    -- 4. Update Conversas
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversas' AND column_name = 'instance_id') THEN
        ALTER TABLE conversas ADD COLUMN instance_id UUID REFERENCES whatsapp_instances(id);
        UPDATE conversas SET instance_id = default_instance_id WHERE instance_id IS NULL;
        ALTER TABLE conversas ALTER COLUMN instance_id SET NOT NULL;

        -- Drop old constraint and add new one
        ALTER TABLE conversas DROP CONSTRAINT IF EXISTS conversas_chat_id_key;
        ALTER TABLE conversas ADD CONSTRAINT conversas_instance_chat_id_key UNIQUE (instance_id, chat_id);
    END IF;

    -- 5. Update Mensagens
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mensagens' AND column_name = 'instance_id') THEN
        ALTER TABLE mensagens ADD COLUMN instance_id UUID REFERENCES whatsapp_instances(id);
        UPDATE mensagens SET instance_id = default_instance_id WHERE instance_id IS NULL;
        ALTER TABLE mensagens ALTER COLUMN instance_id SET NOT NULL;
        
        -- Index for performance
        CREATE INDEX IF NOT EXISTS idx_mensagens_instance_id ON mensagens(instance_id);
    END IF;

END $$;

COMMIT;
