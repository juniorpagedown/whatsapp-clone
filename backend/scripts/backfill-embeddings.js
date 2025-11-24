/* eslint-disable no-console */
// scripts/backfill-embeddings.js
require('dotenv').config({ path: process.env.DOTENV_PATH || '.env' });

const pool = require('../src/infrastructure/database/postgres');
const logger = require('../src/shared/config/logger.config');
const embeddingService = require('../src/domain/services/embedding.service');
const {
  generateKnowledgeBaseEmbedding,
  generateCatalogEmbedding,
  vectorToPg
} = embeddingService;

const BATCH_SIZE = parseInt(
  process.env.EMBEDDING_BACKFILL_BATCH_SIZE
    || process.env.EMBEDDING_BACKFILL_BATCH
    || '50',
  10
);
const MAX_EMPTY_CYCLES = parseInt(process.env.EMBEDDING_BACKFILL_MAX_EMPTY || '3', 10);
const WAIT_BETWEEN_CYCLES_MS = parseInt(process.env.EMBEDDING_BACKFILL_SLEEP_MS || '1000', 10);
const MARK_EMPTY_AS_SKIPPED = String(process.env.EMBEDDING_MARK_EMPTY_AS_SKIPPED || 'true').toLowerCase() === 'true';
const SKIP_FLAG_FIELD = 'embedding_skipped';
const SKIP_REASON_FIELD = 'embedding_skip_reason';
const SKIP_TIMESTAMP_FIELD = 'embedding_skipped_at';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Valida configuração antes de iniciar backfill
 */
async function validateSetup() {
  console.log('🔍 Validando configuração do sistema de embeddings...\n');

  // 1. Verificar feature flag
  if (process.env.FEATURE_EMBEDDING !== 'true') {
    throw new Error('❌ FEATURE_EMBEDDING não está ativado no .env');
  }
  console.log('✅ Feature flag ativada');

  // 2. Verificar modelo configurado
  const model = process.env.EMBEDDING_MODEL || process.env.OPENAI_MODEL_EMBEDDING;
  if (!model) {
    throw new Error('❌ EMBEDDING_MODEL não configurado no .env');
  }
  console.log(`✅ Modelo configurado: ${model}`);

  // 3. Testar credenciais com embedding dummy
  try {
    console.log('🔑 Testando credenciais do provider...');
    const testEmbedding = await embeddingService.generateEmbedding('teste de validação');

    if (!testEmbedding || !Array.isArray(testEmbedding) || testEmbedding.length === 0) {
      throw new Error('Provider retornou resposta inválida');
    }

    console.log(`✅ Provider OK - embedding gerado com ${testEmbedding.length} dimensões\n`);
    return true;
  } catch (error) {
    console.error('❌ Falha ao validar provider:', error.message);

    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error('Credenciais inválidas. Verifique OPENAI_API_KEY ou similar no .env');
    }

    if (error.response?.status === 429) {
      throw new Error('Rate limit do provider. Aguarde alguns minutos antes de tentar novamente.');
    }

    if (error.response?.status === 503) {
      throw new Error('Serviço temporariamente indisponível (503). Tente novamente em alguns minutos.');
    }

    throw error;
  }
}

async function marcarMensagemComoIgnorada(messageId, reason = 'no-content') {
  if (!MARK_EMPTY_AS_SKIPPED) {
    return;
  }

  await pool.query(
    `
      UPDATE mensagens
      SET metadata = COALESCE(metadata, '{}'::jsonb)
          || jsonb_build_object(
            '${SKIP_FLAG_FIELD}', true,
            '${SKIP_REASON_FIELD}', to_json($2::text),
            '${SKIP_TIMESTAMP_FIELD}', to_json(NOW()::text)
          )
      WHERE id = $1
    `,
    [messageId, reason]
  );
}

/**
 * Extrai texto processável de uma mensagem baseado no tipo e campos disponíveis
 */
function extrairTextoParaEmbedding(row) {
  // 1. Se tem texto direto, usar
  if (row.texto && row.texto.trim().length > 0) {
    return row.texto.trim();
  }

  // 2. Se tem caption, usar caption com prefixo do tipo
  if (row.caption && row.caption.trim().length > 0) {
    const tipoLabel = obterLabelTipo(row.tipo_mensagem);
    return `${tipoLabel} ${row.caption.trim()}`;
  }

  // 3. Gerar texto descritivo baseado no tipo de mensagem
  switch (row.tipo_mensagem) {
    case 'imageMessage':
      return row.media_mime_type 
        ? `[Imagem enviada - ${row.media_mime_type}]`
        : '[Imagem enviada]';

    case 'audioMessage':
      return '[Mensagem de áudio]';

    case 'videoMessage':
      return row.media_mime_type
        ? `[Vídeo enviado - ${row.media_mime_type}]`
        : '[Vídeo enviado]';

    case 'documentMessage':
      return row.media_mime_type
        ? `[Documento enviado - ${row.media_mime_type}]`
        : '[Documento enviado]';

    case 'contactMessage':
      return '[Contato compartilhado]';

    case 'contactsArrayMessage':
      return '[Múltiplos contatos compartilhados]';

    case 'albumMessage':
      return '[Álbum de mídia]';

    case 'stickerMessage':
      return '[Figurinha enviada]';

    case 'reactionMessage':
      // Reações não precisam de embedding (são muito curtas e sem contexto)
      return null;

    case 'conversation':
      // Conversation deveria ter texto, se não tem é problema
      return null;

    default:
      // Tipos desconhecidos - tentar usar metadata se existir
      if (row.metadata && typeof row.metadata === 'object') {
        const metaText = JSON.stringify(row.metadata);
        if (metaText.length > 10) {
          return `[${row.tipo_mensagem || 'Mensagem'}]: ${metaText.substring(0, 200)}`;
        }
      }
      return null;
  }
}

/**
 * Retorna label amigável para o tipo de mensagem
 */
function obterLabelTipo(tipoMensagem) {
  const labels = {
    imageMessage: '[Imagem]',
    audioMessage: '[Áudio]',
    videoMessage: '[Vídeo]',
    documentMessage: '[Documento]',
    contactMessage: '[Contato]',
    contactsArrayMessage: '[Contatos]',
    albumMessage: '[Álbum]',
    stickerMessage: '[Sticker]',
    conversation: ''
  };
  return labels[tipoMensagem] || `[${tipoMensagem}]`;
}

/**
 * Processa um registro com retry e backoff exponencial
 */
async function processWithRetry(record, maxRetries = 3) {
  // Extrair texto processável da mensagem
  const textoParaEmbed = extrairTextoParaEmbedding(record);
  
  if (!textoParaEmbed) {
    // Mensagem não tem conteúdo processável
    return null;
  }

  const MAX_RETRIES = parseInt(process.env.EMBEDDING_BACKFILL_MAX_RETRIES || `${maxRetries}`, 10);
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const embedding = await embeddingService.generateEmbedding(textoParaEmbed);
      return embedding;
    } catch (error) {
      lastError = error;
      const status = error.response?.status;

      // Erros fatais - não fazer retry
      if (status === 401 || status === 403) {
        console.error(`❌ Erro de autenticação (${status}). Abortando backfill.`);
        throw error;
      }

      // Rate limit ou serviço indisponível - backoff exponencial
      if (status === 429 || status === 503) {
        const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`⏳ ${status === 429 ? 'Rate limit' : 'Serviço indisponível'}. Aguardando ${waitTime / 1000}s (tentativa ${attempt}/${MAX_RETRIES})...`);
        await delay(waitTime);
        continue;
      }

      // Outros erros - retry simples
      if (attempt < MAX_RETRIES) {
        console.log(`⚠️  Erro temporário no registro ${record.id}. Tentativa ${attempt}/${MAX_RETRIES}...`);
        await delay(1000);
      } else {
        console.error(`❌ Falha definitiva no registro ${record.id} após ${MAX_RETRIES} tentativas:`, error.message);
      }
    }
  }

  throw lastError;
}

async function backfillMensagens() {
  console.log('\n🔁 Iniciando backfill de embeddings para mensagens...');
  let totalAtualizadas = 0;
  let totalPuladas = 0;
  let porTipo = {};
  let ciclosSemProgresso = 0;

  while (true) {
    const { rows } = await pool.query(
      `
        SELECT 
          id, 
          tipo_mensagem,
          texto, 
          caption,
          media_url,
          media_mime_type,
          metadata
        FROM mensagens
        WHERE embedding IS NULL
          AND (metadata->>'${SKIP_FLAG_FIELD}') IS DISTINCT FROM 'true'
        ORDER BY id
        LIMIT $1
      `,
      [BATCH_SIZE]
    );

    if (rows.length === 0) {
      break;
    }

    let sucesso = 0;
    let falhas = 0;
    let puladas = 0;

    for (const row of rows) {
      try {
        const embedding = await processWithRetry(row);
        
        // Se retornou null, não há conteúdo processável
        if (embedding === null) {
          puladas += 1;
          totalPuladas += 1;
          await marcarMensagemComoIgnorada(row.id, 'no-content');
          
          // Contabilizar por tipo
          const tipo = row.tipo_mensagem || 'unknown';
          porTipo[tipo] = porTipo[tipo] || { processadas: 0, puladas: 0 };
          porTipo[tipo].puladas += 1;
          
          continue;
        }

        if (!embedding || !Array.isArray(embedding)) {
          console.warn(`   ⚠ Embedding inválido para mensagem ${row.id}. Pulando.`);
          falhas += 1;
          continue;
        }

        await pool.query(
          'UPDATE mensagens SET embedding = $1 WHERE id = $2',
          [vectorToPg(embedding), row.id]
        );
        
        sucesso += 1;
        totalAtualizadas += 1;
        
        // Contabilizar por tipo
        const tipo = row.tipo_mensagem || 'unknown';
        porTipo[tipo] = porTipo[tipo] || { processadas: 0, puladas: 0 };
        porTipo[tipo].processadas += 1;
        
      } catch (error) {
        falhas += 1;
        if (error.message === 'empty-text') {
          await marcarMensagemComoIgnorada(row.id, 'empty-text');
        }
        console.warn(`   ⚠ Falha ao processar mensagem ${row.id}: ${error.message}`);
      }
    }

    console.log(`   ▶ Batch: ${rows.length} msgs | ✅ ${sucesso} | ⏭️  ${puladas} | ❌ ${falhas}`);

    if (sucesso === 0 && puladas === 0) {
      ciclosSemProgresso += 1;
      if (ciclosSemProgresso >= MAX_EMPTY_CYCLES) {
        console.error(
          `❌ Nenhum progresso após ${MAX_EMPTY_CYCLES} ciclos. Verifique provider.`
        );
        break;
      }
    } else {
      ciclosSemProgresso = 0;
    }

    if (WAIT_BETWEEN_CYCLES_MS > 0) {
      await delay(WAIT_BETWEEN_CYCLES_MS);
    }
  }

  console.log(`\n✅ Backfill de mensagens concluído!`);
  console.log(`   📊 Total processadas: ${totalAtualizadas}`);
  
  if (totalPuladas > 0) {
    console.log(`   ⏭️  Total puladas (sem conteúdo): ${totalPuladas}`);
    
    console.log('\n   📋 Detalhamento por tipo:');
    Object.entries(porTipo)
      .sort((a, b) => (b[1].processadas + b[1].puladas) - (a[1].processadas + a[1].puladas))
      .forEach(([tipo, stats]) => {
        const total = stats.processadas + stats.puladas;
        console.log(`      ${tipo.padEnd(25)} | ✅ ${stats.processadas} | ⏭️  ${stats.puladas} | Total: ${total}`);
      });
  }
}

async function backfillConhecimentoBase() {
  console.log('\n🔁 Iniciando backfill de embeddings para conhecimento_base...');
  const { rows } = await pool.query(
    `
      SELECT id, conteudo
      FROM conhecimento_base
      WHERE embedding IS NULL
        AND conteudo IS NOT NULL
        AND TRIM(conteudo) != ''
    `
  );

  if (rows.length === 0) {
    console.log('   ℹ️  Nenhum registro pendente.');
    return;
  }

  let sucesso = 0;
  let falhas = 0;

  for (const row of rows) {
    try {
      const resultado = await generateKnowledgeBaseEmbedding({
        knowledgeId: row.id,
        conteudo: row.conteudo
      });
      if (resultado.status === 'ok') {
        sucesso += 1;
      } else {
        falhas += 1;
      }
    } catch (error) {
      falhas += 1;
      console.warn(`   ⚠ Falha ao processar conhecimento ${row.id}: ${error.message}`);
    }
  }

  console.log(`✅ Backfill de conhecimento concluído.`);
  console.log(`   📊 Sucesso: ${sucesso} | Falhas: ${falhas}`);
}

async function backfillCatalogoClassificacao() {
  console.log('\n🔁 Iniciando backfill de embeddings para classificacao_catalogo...');
  const { rows } = await pool.query(
    `
      SELECT id, macro, item, pos, neg
      FROM classificacao_catalogo
      WHERE embedding IS NULL
        AND ativo = TRUE
    `
  );

  if (rows.length === 0) {
    console.log('   ℹ️  Nenhum registro pendente.');
    return;
  }

  let sucesso = 0;
  let falhas = 0;

  for (const row of rows) {
    try {
      const resultado = await generateCatalogEmbedding({
        catalogId: row.id,
        macro: row.macro,
        item: row.item,
        pos: row.pos,
        neg: row.neg
      });

      if (resultado.status === 'ok') {
        sucesso += 1;
      } else {
        falhas += 1;
      }
    } catch (error) {
      falhas += 1;
      console.warn(`   ⚠ Falha ao processar catálogo ${row.id}: ${error.message}`);
    }
  }

  console.log(`✅ Backfill de catálogo concluído.`);
  console.log(`   📊 Sucesso: ${sucesso} | Falhas: ${falhas}`);
}

async function main() {
  try {
    await validateSetup();
    console.log('🚀 Iniciando backfill de embeddings...\n');

    await backfillCatalogoClassificacao();
    await backfillMensagens();
    await backfillConhecimentoBase();

    console.log('\n🎉 Backfill completo finalizado!');
    console.log('💡 Execute "npm run embeddings:diagnose" para verificar cobertura.\n');
  } catch (error) {
    logger.error('Erro ao executar backfill de embeddings', { error: error.message });
    console.error('❌ Erro durante backfill:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  backfillMensagens,
  backfillConhecimentoBase,
  backfillCatalogoClassificacao,
  main
};
