#!/usr/bin/env node

/**
 * Script para remover mensagens duplicadas do banco de dados
 *
 * Identifica e remove mensagens duplicadas baseado em:
 * - message_id (duplicatas exatas)
 * - conversa_id + timestamp + texto (duplicatas por conteúdo)
 */

const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

// Configuração do pool de conexões
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const CHAT_ID = '556296155958@s.whatsapp.net';

async function findDuplicates() {
  console.log('🔍 Buscando mensagens duplicadas...\n');

  // Buscar duplicatas por message_id
  const duplicatesByMessageId = await pool.query(`
    SELECT message_id, COUNT(*) as count, ARRAY_AGG(id ORDER BY id) as ids
    FROM mensagens
    WHERE message_id IS NOT NULL
    GROUP BY message_id
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  `);

  console.log(`📋 Duplicatas por message_id: ${duplicatesByMessageId.rows.length}`);

  if (duplicatesByMessageId.rows.length > 0) {
    console.log('\nExemplos:');
    duplicatesByMessageId.rows.slice(0, 5).forEach(row => {
      console.log(`  - message_id: ${row.message_id} (${row.count} cópias)`);
    });
  }

  // Buscar duplicatas por conteúdo (mesmo texto, timestamp e conversa)
  const duplicatesByContent = await pool.query(`
    SELECT
      conversa_id,
      texto,
      timestamp,
      is_from_me,
      COUNT(*) as count,
      ARRAY_AGG(id ORDER BY id) as ids,
      MIN(id) as keep_id
    FROM mensagens
    WHERE texto IS NOT NULL
      AND texto != ''
    GROUP BY conversa_id, texto, timestamp, is_from_me
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  `);

  console.log(`\n📋 Duplicatas por conteúdo: ${duplicatesByContent.rows.length}`);

  if (duplicatesByContent.rows.length > 0) {
    console.log('\nExemplos:');
    duplicatesByContent.rows.slice(0, 5).forEach(row => {
      console.log(`  - "${row.texto?.substring(0, 50)}..." (${row.count} cópias)`);
    });
  }

  // Buscar duplicatas para o chat específico
  const duplicatesForChat = await pool.query(`
    SELECT
      m.id,
      m.message_id,
      m.texto,
      m.timestamp,
      m.is_from_me,
      m.conversa_id,
      c.chat_id
    FROM mensagens m
    JOIN conversas c ON m.conversa_id = c.id
    WHERE c.chat_id = $1
    ORDER BY m.timestamp DESC, m.id DESC
  `, [CHAT_ID]);

  console.log(`\n📱 Total de mensagens para o chat ${CHAT_ID}: ${duplicatesForChat.rows.length}`);

  return {
    byMessageId: duplicatesByMessageId.rows,
    byContent: duplicatesByContent.rows,
    forChat: duplicatesForChat.rows
  };
}

async function removeDuplicatesByMessageId(dryRun = true) {
  console.log('\n🗑️  Removendo duplicatas por message_id...\n');

  const duplicates = await pool.query(`
    SELECT message_id, ARRAY_AGG(id ORDER BY id) as ids
    FROM mensagens
    WHERE message_id IS NOT NULL
    GROUP BY message_id
    HAVING COUNT(*) > 1
  `);

  let totalRemoved = 0;

  for (const row of duplicates.rows) {
    // Manter o primeiro (menor ID), remover os demais
    const [keepId, ...removeIds] = row.ids;

    if (dryRun) {
      console.log(`[DRY RUN] Manteria ID ${keepId}, removeria ${removeIds.length} duplicatas`);
    } else {
      const result = await pool.query(
        'DELETE FROM mensagens WHERE id = ANY($1) RETURNING id',
        [removeIds]
      );
      console.log(`✅ Removidas ${result.rowCount} duplicatas (mantido ID ${keepId})`);
      totalRemoved += result.rowCount;
    }
  }

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Total: ${totalRemoved} mensagens duplicadas`);
  return totalRemoved;
}

async function removeDuplicatesByContent(dryRun = true) {
  console.log('\n🗑️  Removendo duplicatas por conteúdo...\n');

  const duplicates = await pool.query(`
    SELECT
      conversa_id,
      texto,
      timestamp,
      is_from_me,
      ARRAY_AGG(id ORDER BY id) as ids
    FROM mensagens
    WHERE texto IS NOT NULL AND texto != ''
    GROUP BY conversa_id, texto, timestamp, is_from_me
    HAVING COUNT(*) > 1
  `);

  let totalRemoved = 0;

  for (const row of duplicates.rows) {
    // Manter o primeiro (menor ID), remover os demais
    const [keepId, ...removeIds] = row.ids;

    if (dryRun) {
      console.log(`[DRY RUN] Manteria ID ${keepId}, removeria ${removeIds.length} duplicatas`);
      console.log(`  Texto: "${row.texto?.substring(0, 50)}..."`);
    } else {
      const result = await pool.query(
        'DELETE FROM mensagens WHERE id = ANY($1) RETURNING id',
        [removeIds]
      );
      console.log(`✅ Removidas ${result.rowCount} duplicatas (mantido ID ${keepId})`);
      totalRemoved += result.rowCount;
    }
  }

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Total: ${totalRemoved} mensagens duplicadas`);
  return totalRemoved;
}

async function analyzeChat(chatId) {
  console.log(`\n📊 Análise detalhada do chat: ${chatId}\n`);

  // Buscar conversa
  const conversa = await pool.query(
    'SELECT * FROM conversas WHERE chat_id = $1',
    [chatId]
  );

  if (conversa.rows.length === 0) {
    console.log('❌ Chat não encontrado no banco de dados');
    return;
  }

  const conversaId = conversa.rows[0].id;
  console.log(`Conversa ID: ${conversaId}`);

  // Estatísticas gerais
  const stats = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT message_id) as unique_message_ids,
      COUNT(DISTINCT timestamp) as unique_timestamps,
      MIN(timestamp) as first_message,
      MAX(timestamp) as last_message
    FROM mensagens
    WHERE conversa_id = $1
  `, [conversaId]);

  console.log('\nEstatísticas:');
  console.log(`  Total de mensagens: ${stats.rows[0].total}`);
  console.log(`  Message IDs únicos: ${stats.rows[0].unique_message_ids}`);
  console.log(`  Timestamps únicos: ${stats.rows[0].unique_timestamps}`);
  console.log(`  Primeira mensagem: ${stats.rows[0].first_message}`);
  console.log(`  Última mensagem: ${stats.rows[0].last_message}`);

  // Buscar duplicatas exatas
  const duplicates = await pool.query(`
    SELECT
      texto,
      timestamp,
      is_from_me,
      COUNT(*) as count,
      ARRAY_AGG(id ORDER BY id) as ids
    FROM mensagens
    WHERE conversa_id = $1
      AND texto IS NOT NULL
    GROUP BY texto, timestamp, is_from_me
    HAVING COUNT(*) > 1
    ORDER BY timestamp DESC
  `, [conversaId]);

  console.log(`\nDuplicatas encontradas: ${duplicates.rows.length}`);

  if (duplicates.rows.length > 0) {
    console.log('\nExemplos de duplicatas:');
    duplicates.rows.slice(0, 10).forEach(row => {
      console.log(`  - "${row.texto}" (${row.count}x) - IDs: ${row.ids.join(', ')}`);
    });
  }

  return {
    conversaId,
    duplicates: duplicates.rows
  };
}

async function removeDuplicatesFromChat(chatId, dryRun = true) {
  console.log(`\n🗑️  Removendo duplicatas do chat: ${chatId}\n`);

  // Buscar conversa
  const conversa = await pool.query(
    'SELECT * FROM conversas WHERE chat_id = $1',
    [chatId]
  );

  if (conversa.rows.length === 0) {
    console.log('❌ Chat não encontrado no banco de dados');
    return 0;
  }

  const conversaId = conversa.rows[0].id;

  const duplicates = await pool.query(`
    SELECT
      texto,
      timestamp,
      is_from_me,
      ARRAY_AGG(id ORDER BY id) as ids
    FROM mensagens
    WHERE conversa_id = $1
      AND texto IS NOT NULL
    GROUP BY texto, timestamp, is_from_me
    HAVING COUNT(*) > 1
  `, [conversaId]);

  let totalRemoved = 0;

  for (const row of duplicates.rows) {
    // Manter o primeiro (menor ID), remover os demais
    const [keepId, ...removeIds] = row.ids;

    if (dryRun) {
      console.log(`[DRY RUN] Manteria ID ${keepId}, removeria ${removeIds.length} duplicatas`);
      console.log(`  Texto: "${row.texto?.substring(0, 50)}..."`);
      console.log(`  Timestamp: ${row.timestamp}`);
      console.log(`  IDs a remover: ${removeIds.join(', ')}`);
    } else {
      const result = await pool.query(
        'DELETE FROM mensagens WHERE id = ANY($1) RETURNING id',
        [removeIds]
      );
      console.log(`✅ Removidas ${result.rowCount} duplicatas (mantido ID ${keepId})`);
      console.log(`  Texto: "${row.texto?.substring(0, 50)}..."`);
      totalRemoved += result.rowCount;
    }
  }

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Total removido: ${totalRemoved} mensagens duplicadas`);
  return totalRemoved;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  const action = args[0];

  console.log('='.repeat(60));
  console.log('  SCRIPT DE REMOÇÃO DE MENSAGENS DUPLICADAS');
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('\n⚠️  MODO DRY RUN - Nenhuma alteração será feita no banco');
    console.log('   Use --execute para realmente remover as duplicatas\n');
  } else {
    console.log('\n⚠️  MODO DE EXECUÇÃO - Duplicatas serão REMOVIDAS!\n');
  }

  try {
    if (action === 'analyze') {
      await findDuplicates();
      await analyzeChat(CHAT_ID);
    } else if (action === 'remove-by-message-id') {
      await removeDuplicatesByMessageId(dryRun);
    } else if (action === 'remove-by-content') {
      await removeDuplicatesByContent(dryRun);
    } else if (action === 'remove-chat') {
      await removeDuplicatesFromChat(CHAT_ID, dryRun);
    } else if (action === 'remove-all') {
      await removeDuplicatesByMessageId(dryRun);
      await removeDuplicatesByContent(dryRun);
    } else {
      console.log('Uso:');
      console.log('  node remove-duplicates.js analyze                   - Apenas analisar');
      console.log('  node remove-duplicates.js remove-by-message-id      - Remover duplicatas por message_id');
      console.log('  node remove-duplicates.js remove-by-content         - Remover duplicatas por conteúdo');
      console.log('  node remove-duplicates.js remove-chat               - Remover duplicatas do chat específico');
      console.log('  node remove-duplicates.js remove-all                - Remover todas as duplicatas');
      console.log('\nAdicione --execute no final para realmente executar (sem ele é dry-run)');
      console.log('\nExemplo:');
      console.log('  node remove-duplicates.js analyze');
      console.log('  node remove-duplicates.js remove-chat --execute');
    }
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

main();
