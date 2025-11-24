#!/usr/bin/env node

/**
 * Script para sincronizar nomes dos grupos da Evolution API
 *
 * Este script:
 * 1. Busca todos os grupos da Evolution API
 * 2. Atualiza os nomes na tabela 'grupos' do banco de dados
 * 3. Preserva nomes existentes (não sobrescreve)
 *
 * Uso: node scripts/sync-group-names.js [--force]
 *   --force: força atualização de todos os nomes, mesmo os existentes
 */

// IMPORTANTE: carregar dotenv ANTES de importar qualquer módulo que use process.env
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const axios = require('axios');
const pool = require('../src/infrastructure/database/postgres');

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;

const forceUpdate = process.argv.includes('--force');

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

async function syncGroupNames(groups) {
  const client = await pool.connect();

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  try {
    await client.query('BEGIN');

    for (const group of groups) {
      const groupId = group.id;
      const groupName = group.subject || groupId;

      try {
        if (forceUpdate) {
          // Modo --force: atualiza todos os nomes
          const result = await client.query(
            `
              INSERT INTO grupos (group_id, nome, participant_count, metadata, updated_at, created_at)
              VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
              ON CONFLICT (group_id)
              DO UPDATE SET
                nome = EXCLUDED.nome,
                participant_count = EXCLUDED.participant_count,
                metadata = jsonb_set(
                  COALESCE(grupos.metadata, '{}'::jsonb),
                  '{evolutionData}',
                  EXCLUDED.metadata->'evolutionData'
                ),
                updated_at = NOW()
              RETURNING (xmax = 0) AS is_insert
            `,
            [
              groupId,
              groupName,
              group.size,
              JSON.stringify({
                evolutionData: {
                  subject: group.subject,
                  size: group.size,
                  creation: group.creation,
                  pictureUrl: group.pictureUrl,
                  isCommunity: group.isCommunity,
                  announce: group.announce,
                  restrict: group.restrict,
                  syncedAt: new Date().toISOString()
                }
              })
            ]
          );

          if (result.rows[0].is_insert) {
            created++;
            console.log(`  ➕ Criado: ${groupId} -> "${groupName}"`);
          } else {
            updated++;
            console.log(`  🔄 Atualizado: ${groupId} -> "${groupName}"`);
          }
        } else {
          // Modo normal: apenas cria novos grupos, não sobrescreve existentes
          const result = await client.query(
            `
              INSERT INTO grupos (group_id, nome, participant_count, metadata, updated_at, created_at)
              VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
              ON CONFLICT (group_id)
              DO UPDATE SET
                participant_count = EXCLUDED.participant_count,
                metadata = jsonb_set(
                  COALESCE(grupos.metadata, '{}'::jsonb),
                  '{evolutionData}',
                  EXCLUDED.metadata->'evolutionData'
                ),
                updated_at = NOW()
              RETURNING (xmax = 0) AS is_insert
            `,
            [
              groupId,
              groupName,
              group.size,
              JSON.stringify({
                evolutionData: {
                  subject: group.subject,
                  size: group.size,
                  creation: group.creation,
                  pictureUrl: group.pictureUrl,
                  isCommunity: group.isCommunity,
                  announce: group.announce,
                  restrict: group.restrict,
                  syncedAt: new Date().toISOString()
                }
              })
            ]
          );

          if (result.rows[0].is_insert) {
            created++;
            console.log(`  ➕ Novo grupo: ${groupId} -> "${groupName}"`);
          } else {
            skipped++;
          }
        }
      } catch (error) {
        errors++;
        console.error(`  ✗ Erro ao processar ${groupId}:`, error.message);
      }
    }

    await client.query('COMMIT');

    console.log('\n' + '='.repeat(60));
    console.log('✅ Sincronização concluída!');
    console.log('='.repeat(60));
    console.log(`  Novos grupos criados: ${created}`);
    console.log(`  Grupos atualizados: ${updated}`);
    console.log(`  Grupos ignorados (já existentes): ${skipped}`);
    console.log(`  Erros: ${errors}`);
    console.log('='.repeat(60));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n✗ Erro durante a sincronização:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  console.log('🚀 Iniciando sincronização de nomes de grupos');
  console.log(`Modo: ${forceUpdate ? 'FORCE (atualiza todos)' : 'NORMAL (apenas novos)'}\n`);

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
    console.error('✗ Configuração da Evolution API não encontrada no .env');
    process.exit(1);
  }

  try {
    const groups = await fetchGroupsFromEvolution();
    await syncGroupNames(groups);

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

module.exports = { fetchGroupsFromEvolution, syncGroupNames };
