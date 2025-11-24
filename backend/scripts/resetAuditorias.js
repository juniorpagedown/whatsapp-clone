#!/usr/bin/env node
/**
 * Reinicia o estado das auditorias e das conversas auditadas.
 *
 * Uso:
 *   node scripts/resetAuditorias.js
 *   node scripts/resetAuditorias.js --purge-history   // também remove os registros da tabela
 *
 * Opcional: defina DOTENV_PATH para apontar para um arquivo .env diferente.
 */
const path = require('path');

const dotenvPath = process.env.DOTENV_PATH || path.join(__dirname, '..', '.env');
require('dotenv').config({ path: dotenvPath });

// Permite sobrepor o host (útil em ambientes com socket unix)
if (process.env.DB_HOST_OVERRIDE) {
  process.env.DB_HOST = process.env.DB_HOST_OVERRIDE;
}

const pool = require('../src/infrastructure/database/postgres');

const args = process.argv.slice(2);
const purgeHistory = args.includes('--purge-history') || args.includes('--purge');

const logSummary = async (client, label) => {
  const { rows } = await client.query(`
    SELECT status, COUNT(*) AS total
      FROM auditorias
     GROUP BY status
     ORDER BY status
  `);

  console.log(`\n${label}`);
  if (rows.length === 0) {
    console.log('  (sem registros na tabela auditorias)');
    return;
  }

  rows.forEach((row) => {
    console.log(`  ${row.status.padEnd(12)} → ${row.total}`);
  });
};

(async () => {
  const client = await pool.connect();

  try {
    await logSummary(client, 'Situação atual:');

    await client.query('BEGIN');

    const cancelResult = await client.query(`
      UPDATE auditorias
         SET status = 'cancelada',
             updated_at = NOW()
    `);
    console.log(`\nAuditorias atualizadas para "cancelada": ${cancelResult.rowCount}`);

    const resetConversas = await client.query(`
      UPDATE conversas
         SET is_auditada = FALSE,
             auditada_em = NULL,
             auditada_por = NULL,
             updated_at = NOW()
       WHERE is_auditada = TRUE
          OR auditada_em IS NOT NULL
          OR auditada_por IS NOT NULL
    `);
    console.log(`Conversas marcadas como não auditadas: ${resetConversas.rowCount}`);

    let deletedAudits = null;
    if (purgeHistory) {
      deletedAudits = await client.query('DELETE FROM auditorias');
      console.log(`Histórico removido da tabela auditorias: ${deletedAudits.rowCount} linha(s) apagada(s).`);
    }

    await client.query('COMMIT');

    await logSummary(client, 'Situação após reset:');

    if (purgeHistory) {
      console.log('\nObservação: como o histórico foi removido, a próxima auditoria começará com a tabela vazia.');
    } else {
      console.log('\nObservação: histórico permanece na tabela (apenas com status "cancelada"). Use --purge-history para limpá-lo.');
    }
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => null);
    console.error('\nErro ao resetar auditorias:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
