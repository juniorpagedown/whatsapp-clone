#!/usr/bin/env node

/**
 * Script para corrigir nomes dos grupos que foram salvos incorretamente
 *
 * Este script:
 * 1. Busca todos os grupos da Evolution API
 * 2. Atualiza os nomes na tabela 'grupos' usando o subject real
 * 3. Corrige grupos que têm o group_id como nome
 *
 * Uso: node scripts/fix-group-names.js
 */

// IMPORTANTE: carregar dotenv ANTES de importar qualquer módulo que use process.env
require('dotenv').config();

const axios = require('axios');
const pool = require('../src/infrastructure/database/postgres');

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;

async function fetchGroupsFromEvolution() {
  try {
    console.log('📡 Buscando grupos da Evolution API...');

    const response = await axios.get(
      `${EVOLUTION_API_URL}/group/fetchAllGroups/${EVOLUTION_INSTANCE}?getParticipants=false`,
      {
        headers: {
          apikey: EVOLUTION_API_KEY
        },
        timeout: 30000
      }
    );

    console.log(`✓ ${response.data.length} grupos encontrados na Evolution API`);
    return response.data;
  } catch (error) {
    console.error('✗ Erro ao buscar grupos da Evolution API:', error.message);
    throw error;
  }
}

async function fixGroupNames(groups) {
  const client = await pool.connect();

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  try {
    await client.query('BEGIN');

    for (const group of groups) {
      const groupId = group.id;
      const correctName = group.subject;

      if (!correctName || correctName === groupId) {
        skipped++;
        continue;
      }

      try {
        // Buscar o nome atual no banco
        const currentResult = await client.query(
          'SELECT nome FROM grupos WHERE group_id = $1',
          [groupId]
        );

        if (currentResult.rows.length === 0) {
          console.log(`  ⚠️  Grupo não encontrado no banco: ${groupId}`);
          skipped++;
          continue;
        }

        const currentName = currentResult.rows[0].nome;

        // Atualizar apenas se o nome atual for igual ao group_id ou estiver vazio
        if (currentName === groupId || !currentName || currentName.trim().length === 0) {
          await client.query(
            `
              UPDATE grupos
              SET nome = $2, updated_at = NOW()
              WHERE group_id = $1
            `,
            [groupId, correctName]
          );

          updated++;
          console.log(`  ✓ Atualizado: ${groupId}`);
          console.log(`    De: "${currentName}"`);
          console.log(`    Para: "${correctName}"`);
        } else if (currentName !== correctName) {
          console.log(`  ℹ️  Mantido nome existente para ${groupId}:`);
          console.log(`    Atual: "${currentName}"`);
          console.log(`    Evolution: "${correctName}"`);
          skipped++;
        } else {
          skipped++;
        }
      } catch (error) {
        errors++;
        console.error(`  ✗ Erro ao processar ${groupId}:`, error.message);
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
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n✗ Erro durante a correção:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  console.log('🚀 Iniciando correção de nomes de grupos\n');

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
    console.error('✗ Configuração da Evolution API não encontrada no .env');
    process.exit(1);
  }

  try {
    const groups = await fetchGroupsFromEvolution();
    await fixGroupNames(groups);

    console.log('\n✓ Script finalizado com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Script finalizado com erro:', error.message);
    process.exit(1);
  }
}

// Executar script
if (require.main === module) {
  main();
}

module.exports = { fetchGroupsFromEvolution, fixGroupNames };
