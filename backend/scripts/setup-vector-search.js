// scripts/setup-vector-search.js
require('dotenv').config({ path: process.env.DOTENV_PATH || '.env' });

const pool = require('../src/infrastructure/database/postgres');
const logger = require('../src/shared/config/logger.config');
const {
  backfillMensagens,
  backfillConhecimentoBase,
  backfillCatalogoClassificacao
} = require('./backfill-embeddings');

const isEmbeddingEnabled = () => String(process.env.FEATURE_EMBEDDING || '').toLowerCase() === 'true';

const INDEX_QUERIES = [
  `CREATE INDEX IF NOT EXISTS idx_mensagens_embedding_ivfflat
     ON mensagens USING ivfflat (embedding vector_cosine_ops)
     WITH (lists = 100);`,
  `CREATE INDEX IF NOT EXISTS idx_classificacao_catalogo_embedding_ivfflat
     ON classificacao_catalogo USING ivfflat (embedding vector_cosine_ops)
     WITH (lists = 100);`,
  `CREATE INDEX IF NOT EXISTS idx_conversa_contexto_embedding_ivfflat
     ON conversa_contexto USING ivfflat (embedding vector_cosine_ops)
     WITH (lists = 100);`
];

const ensurePgVectorExtension = async () => {
  const { rows } = await pool.query(
    "SELECT extname FROM pg_extension WHERE extname = 'vector'"
  );

  if (!rows.length) {
    throw new Error('Extensão pgvector não está instalada. Execute: CREATE EXTENSION IF NOT EXISTS vector;');
  }
};

const ensureCatalogEmbeddingColumn = async () => {
  const { rows } = await pool.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'classificacao_catalogo'
        AND column_name = 'embedding'
    `
  );

  if (!rows.length) {
    await pool.query('ALTER TABLE classificacao_catalogo ADD COLUMN IF NOT EXISTS embedding vector(1536);');
  }
};

const ensureIndexes = async () => {
  for (const query of INDEX_QUERIES) {
    await pool.query(query);
  }
};

const backfillEmbeddings = async () => {
  if (!isEmbeddingEnabled()) {
    logger.warn('FEATURE_EMBEDDING=false - pulando backfill de embeddings.');
    return;
  }

  await backfillCatalogoClassificacao();
  await backfillMensagens();
  await backfillConhecimentoBase();
};

const main = async () => {
  try {
    await ensurePgVectorExtension();
    await ensureCatalogEmbeddingColumn();
    await ensureIndexes();
    await backfillEmbeddings();
    logger.info('Setup de busca vetorial concluído com sucesso.');
  } catch (error) {
    logger.error('Erro durante setup de busca vetorial', { error: error.message });
    console.error('❌ Setup de busca vetorial falhou:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

if (require.main === module) {
  main();
}

module.exports = {
  main
};
