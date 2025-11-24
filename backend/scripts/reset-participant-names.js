#!/usr/bin/env node

/**
 * Script para resetar nomes de grupos que foram salvos com nomes de participantes
 *
 * Este script:
 * 1. Identifica grupos com nomes que parecem ser de participantes
 * 2. Reseta esses nomes para o group_id
 * 3. Na próxima mensagem recebida, o webhook salvará o nome correto
 *
 * Uso: node scripts/reset-participant-names.js
 */

// IMPORTANTE: carregar dotenv ANTES de importar qualquer módulo que use process.env
require('dotenv').config();

const pool = require('../src/infrastructure/database/postgres');

// Padrões que indicam que o nome é de um participante
const PARTICIPANT_NAME_PATTERNS = [
  /Suporte/i,
  /^[A-Z][a-z]+$/,  // Nome simples como "Juninho", "Lucas", etc
  /^[A-Z][a-z]+ [A-Z][a-z]+$/,  // Nome completo simples como "John Silva"
];

// Padrões que indicam que o nome é de um evento (devem ser preservados)
const EVENT_NAME_PATTERNS = [
  /PRD/i,
  /BEM/i,
  /PCD/i,
  /\d{4}/,  // Contém números de 4 dígitos (códigos de evento)
  /JOGOS/i,
  /FESTIVAL/i,
];

function looksLikeParticipantName(name, groupId) {
  // Se o nome é igual ao group_id, já está "resetado"
  if (name === groupId) {
    return false;
  }

  // Se contém padrões de evento, não é nome de participante
  const hasEventPattern = EVENT_NAME_PATTERNS.some(pattern => pattern.test(name));
  if (hasEventPattern) {
    return false;
  }

  // Se contém padrões de participante, provavelmente é nome de participante
  const hasParticipantPattern = PARTICIPANT_NAME_PATTERNS.some(pattern => pattern.test(name));
  if (hasParticipantPattern) {
    return true;
  }

  // Se o nome é muito curto (menos de 15 caracteres) e não tem padrão de evento
  if (name.length < 15) {
    return true;
  }

  return false;
}

async function resetParticipantNames() {
  const client = await pool.connect();

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  try {
    console.log('🚀 Iniciando reset de nomes de participantes\n');
    console.log('📊 Buscando grupos do banco de dados...');

    // Buscar todos os grupos
    const result = await client.query(`
      SELECT id, group_id, nome
      FROM grupos
      WHERE nome != group_id
      ORDER BY updated_at DESC
    `);

    console.log(`✓ ${result.rows.length} grupos encontrados para análise\n`);

    await client.query('BEGIN');

    for (const group of result.rows) {
      const { id, group_id, nome } = group;

      try {
        if (looksLikeParticipantName(nome, group_id)) {
          // Resetar para group_id
          await client.query(
            `
              UPDATE grupos
              SET nome = $2, updated_at = NOW()
              WHERE id = $1
            `,
            [id, group_id]
          );

          updated++;
          console.log(`  ✓ Resetado: ${group_id}`);
          console.log(`    Nome antigo: "${nome}"`);
          console.log(`    Nome novo: "${group_id}" (será atualizado na próxima mensagem)\n`);
        } else {
          skipped++;
        }
      } catch (error) {
        errors++;
        console.error(`  ✗ Erro ao processar ${group_id}:`, error.message);
      }
    }

    await client.query('COMMIT');

    console.log('='.repeat(60));
    console.log('✅ Reset concluído!');
    console.log('='.repeat(60));
    console.log(`  Grupos resetados: ${updated}`);
    console.log(`  Grupos preservados: ${skipped}`);
    console.log(`  Erros: ${errors}`);
    console.log('='.repeat(60));

    if (updated > 0) {
      console.log('\n💡 Os grupos resetados terão seus nomes atualizados');
      console.log('   automaticamente quando receberem a próxima mensagem.');
      console.log('\n   Ou você pode executar fix-group-names.js para atualizar');
      console.log('   todos de uma vez usando a Evolution API.');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n✗ Erro durante o reset:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Executar script
if (require.main === module) {
  resetParticipantNames()
    .then(() => {
      console.log('\n✓ Script finalizado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Script finalizado com erro:', error.message);
      process.exit(1);
    });
}

module.exports = { resetParticipantNames, looksLikeParticipantName };
