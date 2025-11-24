-- Tabela de auditorias por conversa
CREATE TABLE IF NOT EXISTS auditorias (
  id                   BIGSERIAL PRIMARY KEY,
  conversa_id          INT NOT NULL REFERENCES conversas(id),
  auditor_user_id      INT NOT NULL REFERENCES usuarios(id), -- quem iniciou
  started_at           TIMESTAMP NOT NULL DEFAULT now(),
  last_read_message_id INT NULL,                             -- opcional: até onde leu
  finalized_at         TIMESTAMP NULL,
  finalized_by         INT NULL REFERENCES usuarios(id),      -- quem finalizou
  notes                TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_auditorias_conversa ON auditorias(conversa_id);
CREATE INDEX IF NOT EXISTS idx_auditorias_finalized_at ON auditorias(finalized_at);
