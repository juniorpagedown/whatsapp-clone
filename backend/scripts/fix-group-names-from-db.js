#!/usr/bin/env node

/**
 * Script para corrigir nomes dos grupos usando os dados já salvos no banco
 *
 * Este script:
 * 1. Busca todos os grupos do banco de dados
 * 2. Extrai o nome real do metadata (se existir)
 * 3. Atualiza o campo 'nome' quando ele for igual ao group_id
 *
 * Uso: node scripts/fix-group-names-from-db.js
 */

// IMPORTANTE: carregar dotenv ANTES de importar qualquer módulo que use process.env
require('dotenv').config();

const pool = require('../src/infrastructure/database/postgres');

async function fixGroupNamesFromDatabase() {
  const client = await pool.connect();

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  try {
    console.log('🚀 Iniciando correção de nomes de grupos usando dados do banco\n');
    console.log('📊 Buscando grupos do banco de dados...');

    // Buscar todos os grupos
    const result = await client.query(`
      SELECT id, group_id, nome, metadata
      FROM grupos
      ORDER BY updated_at DESC
    `);

    console.log(`✓ ${result.rows.length} grupos encontrados\n`);

    await client.query('BEGIN');

    for (const group of result.rows) {
      const { id, group_id, nome, metadata } = group;

      try {
        // Pular se o nome já estiver correto (diferente do group_id)
        if (nome && nome !== group_id && nome.trim().length > 0) {
          skipped++;
          continue;
        }

        // Tentar extrair o nome real do metadata
        let correctName = null;

        if (metadata && typeof metadata === 'object') {
          // Procurar o subject em vários lugares possíveis no metadata
          correctName =
            metadata.evolutionData?.subject ||
            metadata.subject ||
            metadata.chatName ||
            metadata.group?.subject ||
            metadata.groupData?.subject ||
            metadata.chat?.subject ||
            null;
        }

        // Se não encontrou nome válido no metadata, pular
        if (!correctName || correctName === group_id) {
          console.log(`  ⚠️  Sem nome válido no metadata: ${group_id}`);
          skipped++;
          continue;
        }

        // Atualizar o nome
        await client.query(
          `
            UPDATE grupos
            SET nome = $2, updated_at = NOW()
            WHERE id = $1
          `,
          [id, correctName]
        );

        updated++;
        console.log(`  ✓ Atualizado: ${group_id}`);
        console.log(`    De: "${nome}"`);
        console.log(`    Para: "${correctName}"`);
      } catch (error) {
        errors++;
        console.error(`  ✗ Erro ao processar ${group_id}:`, error.message);
      }
    }

    await client.query('COMMIT');

    console.log('\n' + '='.repeat(60));
    console.log('✅ Correção concluída!');
    console.log('='.repeat(60));
    console.log(`  Grupos atualizados: ${updated}`);
    console.log(`  Grupos ignorados: ${skipped}`);
    console.log(`  Erros: ${errors}`);
    console.log('='.repeat(60));

    if (updated === 0 && skipped > 0) {
      console.log('\n💡 Dica: Se os grupos ainda estão com nomes incorretos,');
      console.log('   execute o script fix-group-names.js para buscar os nomes');
      console.log('   corretos da Evolution API.');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n✗ Erro durante a correção:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Executar script
if (require.main === module) {
  fixGroupNamesFromDatabase()
    .then(() => {
      console.log('\n✓ Script finalizado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Script finalizado com erro:', error.message);
      process.exit(1);
    });
}

module.exports = { fixGroupNamesFromDatabase };
