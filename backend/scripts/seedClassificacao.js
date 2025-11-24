// scripts/seedClassificacao.js
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const dotenv = require('dotenv');

const rootEnvPath = path.resolve(__dirname, '..', '.env');
const fallbackEnvPath = path.resolve(__dirname, '..', '..', '.env');

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config({ path: fallbackEnvPath });
}

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'whatsapp_clone',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: parseInt(process.env.DB_POOL_MAX, 10) || 10
});

const catalogPath = path.resolve(__dirname, '..', 'docs', 'catalogo-classificacao.json');

const loadCatalog = () => {
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Arquivo de catálogo não encontrado em ${catalogPath}`);
  }

  const raw = fs.readFileSync(catalogPath, 'utf-8');
  const json = JSON.parse(raw);

  if (!json.macros || typeof json.macros !== 'object') {
    throw new Error('Estrutura do catálogo inválida: campo "macros" ausente');
  }

  const entries = [];

  const macroOrder = Array.isArray(json.prioridade_macro) ? json.prioridade_macro : Object.keys(json.macros);

  for (const macroName of macroOrder) {
    const items = json.macros[macroName];
    if (!items) {
      continue;
    }

    const itemEntries = Object.entries(items);
    for (const [itemName, rule] of itemEntries) {
      const pos = Array.isArray(rule?.pos) ? rule.pos : [];
      const neg = Array.isArray(rule?.neg) ? rule.neg : [];
      const ativo = typeof rule?.ativo === 'boolean' ? rule.ativo : true;

      entries.push({
        macro: macroName,
        item: itemName,
        pos,
        neg,
        ativo
      });
    }
  }

  return entries;
};

const seedCatalog = async () => {
  const entries = loadCatalog();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const entry of entries) {
      await client.query(
        `
          INSERT INTO classificacao_catalogo (macro, item, pos, neg, ativo)
          VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
          ON CONFLICT (macro, item)
          DO UPDATE SET
            pos = EXCLUDED.pos,
            neg = EXCLUDED.neg,
            ativo = EXCLUDED.ativo,
            updated_at = CURRENT_TIMESTAMP
        `,
        [
          entry.macro,
          entry.item,
          JSON.stringify(entry.pos || []),
          JSON.stringify(entry.neg || []),
          entry.ativo
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`✅ Catálogo de classificação sincronizado (${entries.length} itens)`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao sincronizar catálogo:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  seedCatalog()
    .catch(() => process.exitCode = 1)
    .finally(() => pool.end());
}

module.exports = {
  seedCatalog
};
