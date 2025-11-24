#!/usr/bin/env node

/**
 * Script para atualizar nomes de grupos usando dados das mensagens
 *
 * Este script:
 * 1. Busca grupos onde nome = group_id
 * 2. Procura no metadata das mensagens desses grupos
 * 3. Extrai o nome real do grupo (subject) do metadata
 * 4. Atualiza o nome no banco
 *
 * Uso: node scripts/fix-from-messages.js
 */

// IMPORTANTE: carregar dotenv ANTES de importar qualquer módulo que use process.env
require('dotenv').config();

const pool = require('../src/infrastructure/database/postgres');

async function extractGroupNameFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  // Procurar subject em vários lugares possíveis do metadata
  const raw = metadata.raw || metadata;

  const candidates = [
    raw?.subject,
    raw?.data?.subject,
    raw?.message?.subject,
    raw?.group?.subject,
    raw?.groupData?.subject,
    raw?.chat?.subject,
    metadata?.subject,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'string' && candidate.trim().length > 0) {
      // Ignorar se for igual a um group_id
      if (!candidate.includes('@g.us')) {
        return candidate.trim();
      }
    }
  }

  return null;
}

async function fixGroupNamesFromMessages() {
  const client = await pool.connect();

  let updated = 0;
  let notFound = 0;
  let errors = 0;

  try {
    console.log('🚀 Iniciando atualização de nomes usando mensagens\n');

    // Buscar grupos onde nome = group_id
    const resetGroups = await client.query(`
      SELECT id, group_id, nome
      FROM grupos
      WHERE nome = group_id
      ORDER BY updated_at DESC
    `);

    if (resetGroups.rows.length === 0) {
      console.log('✅ Nenhum grupo precisa ser atualizado!');
      return;
    }

    console.log(`📊 ${resetGroups.rows.length} grupos precisam de atualização\n`);

    await client.query('BEGIN');

    for (const group of resetGroups.rows) {
      const { id, group_id } = group;

      try {
        // Buscar a mensagem mais recente desse grupo
        const messageResult = await client.query(`
          SELECT m.metadata
          FROM mensagens m
          JOIN conversas c ON c.id = m.conversa_id
          WHERE c.chat_id = $1
            AND m.metadata IS NOT NULL
          ORDER BY m.timestamp DESC
          LIMIT 10
        `, [group_id]);

        let correctName = null;

        // Tentar extrair o nome de cada mensagem
        for (const msg of messageResult.rows) {
          correctName = await extractGroupNameFromMetadata(msg.metadata);
          if (correctName) break;
        }

        if (!correctName) {
          notFound++;
          console.log(`  ⚠️  Nome não encontrado no metadata: ${group_id}`);
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
        console.log(`    Nome: "${correctName}"\n`);
      } catch (error) {
        errors++;
        console.error(`  ✗ Erro ao processar ${group_id}:`, error.message);
      }
    }

    await client.query('COMMIT');

    console.log('='.repeat(60));
    console.log('✅ Atualização concluída!');
    console.log('='.repeat(60));
    console.log(`  Grupos atualizados: ${updated}`);
    console.log(`  Grupos não encontrados: ${notFound}`);
    console.log(`  Erros: ${errors}`);
    console.log('='.repeat(60));

    if (notFound > 0) {
      console.log('\n💡 Os grupos não encontrados ainda não têm mensagens');
      console.log('   com metadata adequado. Eles serão atualizados');
      console.log('   quando receberem uma nova mensagem.');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n✗ Erro durante a atualização:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Executar script
if (require.main === module) {
  fixGroupNamesFromMessages()
    .then(() => {
      console.log('\n✓ Script finalizado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Script finalizado com erro:', error.message);
      process.exit(1);
    });
}

module.exports = { fixGroupNamesFromMessages };
