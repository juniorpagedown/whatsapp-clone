#!/usr/bin/env node

/**
 * Script para atualizar apenas os grupos que estão com group_id como nome
 *
 * Este script:
 * 1. Busca apenas grupos onde nome = group_id
 * 2. Busca o nome correto da Evolution API
 * 3. Atualiza o nome no banco
 *
 * Uso: node scripts/update-reset-groups.js
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
        timeout: 90000  // 90 segundos
      }
    );

    console.log(`✓ ${response.data.length} grupos encontrados na Evolution API\n`);
    return response.data;
  } catch (error) {
    console.error('✗ Erro ao buscar grupos da Evolution API:', error.message);
    return null;
  }
}

async function updateResetGroups() {
  const client = await pool.connect();

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let notFound = 0;

  try {
    console.log('🚀 Iniciando atualização de grupos resetados\n');

    // Buscar apenas grupos onde nome = group_id
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

    // Buscar todos os grupos da Evolution API
    const evolutionGroups = await fetchGroupsFromEvolution();

    if (!evolutionGroups) {
      console.log('\n⚠️  Não foi possível buscar os grupos da Evolution API.');
      console.log('   Os grupos serão atualizados automaticamente quando receberem mensagens.');
      return;
    }

    // Criar um mapa para busca rápida
    const groupMap = new Map();
    evolutionGroups.forEach(group => {
      if (group.id && group.subject) {
        groupMap.set(group.id, group.subject);
      }
    });

    await client.query('BEGIN');

    for (const group of resetGroups.rows) {
      const { id, group_id } = group;

      try {
        const correctName = groupMap.get(group_id);

        if (!correctName) {
          notFound++;
          console.log(`  ⚠️  Grupo não encontrado na Evolution: ${group_id}`);
          continue;
        }

        if (correctName === group_id) {
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
    console.log(`  Grupos ignorados: ${skipped}`);
    console.log(`  Erros: ${errors}`);
    console.log('='.repeat(60));
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
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
    console.error('✗ Configuração da Evolution API não encontrada no .env');
    process.exit(1);
  }

  updateResetGroups()
    .then(() => {
      console.log('\n✓ Script finalizado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Script finalizado com erro:', error.message);
      process.exit(1);
    });
}

module.exports = { updateResetGroups };
