#!/usr/bin/env node

/**
 * Script de diagnóstico do sistema de embeddings vetoriais
 * Verifica configuração, testa provider e exibe estatísticas
 */

require('dotenv').config({ path: process.env.DOTENV_PATH || '.env' });
const embeddingService = require('../src/domain/services/embedding.service');
const db = require('../src/infrastructure/database/postgres');

async function diagnose() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  🔍 DIAGNÓSTICO - Sistema de Embeddings Vetoriais     ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  let hasErrors = false;

  // ============================================================
  // 1. VERIFICAR VARIÁVEIS DE AMBIENTE
  // ============================================================
  console.log('📋 CONFIGURAÇÃO');
  console.log('─────────────────────────────────────────────────────────');

  const featureEnabled = process.env.FEATURE_EMBEDDING === 'true';
  console.log(`   FEATURE_EMBEDDING: ${featureEnabled ? '✅ true' : '❌ false (desativado)'}`);

  const model = process.env.EMBEDDING_MODEL || process.env.OPENAI_MODEL_EMBEDDING;
  if (model) {
    console.log(`   EMBEDDING_MODEL: ✅ ${model}`);
    if (process.env.OPENAI_MODEL_EMBEDDING && !process.env.EMBEDDING_MODEL) {
      console.log('   ⚠️  Usando OPENAI_MODEL_EMBEDDING (deprecated). Migre para EMBEDDING_MODEL');
    }
  } else {
    console.log('   EMBEDDING_MODEL: ❌ não configurado');
    hasErrors = true;
  }

  const hasApiKey = !!process.env.OPENAI_API_KEY;
  console.log(`   OPENAI_API_KEY: ${hasApiKey ? '✅ configurado' : '❌ ausente'}`);
  if (!hasApiKey) hasErrors = true;

  console.log('');

  // ============================================================
  // 2. TESTAR PROVIDER DE EMBEDDINGS
  // ============================================================
  console.log('🔌 TESTE DE PROVIDER');
  console.log('─────────────────────────────────────────────────────────');

  if (!featureEnabled) {
    console.log('   ⏭️  Pulado (feature desativada)\n');
  } else if (!hasApiKey) {
    console.log('   ❌ Impossível testar sem API key\n');
    hasErrors = true;
  } else {
    try {
      const start = Date.now();
      const embedding = await embeddingService.generateTextEmbedding('teste de conexão');
      const duration = Date.now() - start;

      console.log('   ✅ Provider respondendo corretamente');
      console.log(`   ⏱️  Latência: ${duration}ms`);
      console.log(`   📏 Dimensões: ${embedding.length}`);
      console.log('');
    } catch (error) {
      console.log(`   ❌ Erro ao conectar: ${error.message}`);
      if (error.response?.status) {
        console.log(`   📡 Status HTTP: ${error.response.status}`);
      }
      console.log('');
      hasErrors = true;
    }
  }

  // ============================================================
  // 3. VERIFICAR ÍNDICES VETORIAIS
  // ============================================================
  console.log('📊 ÍNDICES VETORIAIS');
  console.log('─────────────────────────────────────────────────────────');

  try {
    const indexes = await db.query(`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes 
      WHERE indexname LIKE '%embedding%'
      ORDER BY tablename, indexname
    `);

    if (indexes.rows.length > 0) {
      indexes.rows.forEach((idx) => {
        console.log(`   ✅ ${idx.tablename}.${idx.indexname}`);
      });
    } else {
      console.log('   ⚠️  Nenhum índice vetorial encontrado');
      console.log('   💡 Execute: npm run setup:vector-search');
      hasErrors = true;
    }
  } catch (error) {
    console.log(`   ❌ Erro ao consultar índices: ${error.message}`);
    hasErrors = true;
  }

  console.log('');

  // ============================================================
  // 4. ESTATÍSTICAS DE EMBEDDINGS
  // ============================================================
  console.log('📈 ESTATÍSTICAS DE COBERTURA');
  console.log('─────────────────────────────────────────────────────────');

  try {
    const stats = await db.query(`
      SELECT 
        'mensagens' as tabela,
        COUNT(*) as total,
        COUNT(embedding) as com_embedding,
        ROUND(COUNT(embedding)::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2) as percentual
      FROM mensagens
      UNION ALL
      SELECT 
        'classificacao_catalogo',
        COUNT(*),
        COUNT(embedding),
        ROUND(COUNT(embedding)::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2)
      FROM classificacao_catalogo
      UNION ALL
      SELECT 
        'conversa_contexto',
        COUNT(*),
        COUNT(embedding),
        ROUND(COUNT(embedding)::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2)
      FROM conversa_contexto
    `);

    stats.rows.forEach((row) => {
      const percent = row.percentual || 0;
      const icon = percent === 100 ? '✅' : percent > 0 ? '⚠️' : '❌';
      console.log(`   ${icon} ${row.tabela.padEnd(25)} ${row.com_embedding}/${row.total} (${percent}%)`);
    });

    const needsBackfill = stats.rows.some((r) => (r.percentual || 0) < 100);
    if (needsBackfill) {
      console.log('\n   💡 Execute backfill: npm run backfill-embeddings');
    }
  } catch (error) {
    console.log(`   ❌ Erro ao consultar estatísticas: ${error.message}`);
    hasErrors = true;
  }

  console.log('');

  // ============================================================
  // 5. RESUMO FINAL
  // ============================================================
  console.log('═══════════════════════════════════════════════════════════');
  if (hasErrors) {
    console.log('❌ DIAGNÓSTICO CONCLUÍDO COM ERROS');
    console.log('   Corrija os problemas acima antes de usar embeddings.');
    console.log('═══════════════════════════════════════════════════════════\n');
    await db.end();
    process.exit(1);
  } else {
    console.log('✅ SISTEMA FUNCIONANDO CORRETAMENTE');
    console.log('   Tudo pronto para usar busca vetorial!');
    console.log('═══════════════════════════════════════════════════════════\n');
    await db.end();
    process.exit(0);
  }
}

// Executar diagnóstico
diagnose().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('\n❌ Erro fatal no diagnóstico:', error.message);
  db.end().finally(() => process.exit(1));
});
