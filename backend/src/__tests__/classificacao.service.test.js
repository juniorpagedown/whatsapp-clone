const test = require('node:test');
const assert = require('node:assert/strict');

if (!process.env.DB_PASSWORD) {
  process.env.DB_PASSWORD = 'test';
}

const pool = require('../infrastructure/database/postgres');
const embeddingService = require('../domain/services/embedding.service');
const classificacaoService = require('../domain/services/classificacao.service');

const originalQuery = pool.query.bind(pool);
const originalGenerateTextEmbedding = embeddingService.generateTextEmbedding;
const originalIsFeatureEnabled = embeddingService.isFeatureEnabled;
const originalVectorWeight = process.env.CLASSIFICACAO_VECTOR_WEIGHT;

const catalogRows = [
  {
    id: 1,
    macro: 'Financeiro',
    item: 'Solicitação de estorno',
    pos: ['estorno', 'reembolso'],
    neg: []
  },
  {
    id: 2,
    macro: 'Marketing & Growth',
    item: 'Link de indicação',
    pos: ['link', 'indicação'],
    neg: []
  }
];

test.afterEach(() => {
  pool.query = originalQuery;
  embeddingService.generateTextEmbedding = originalGenerateTextEmbedding;
  embeddingService.isFeatureEnabled = originalIsFeatureEnabled;
  process.env.CLASSIFICACAO_VECTOR_WEIGHT = originalVectorWeight;
});

test('suggestFromText usa somente keywords quando embeddings estão desativados', async () => {
  embeddingService.isFeatureEnabled = () => false;
  pool.query = async (text) => {
    if (text.includes('FROM classificacao_catalogo')) {
      return { rows: catalogRows };
    }
    throw new Error('Query inesperada');
  };

  const results = await classificacaoService.suggestFromText({
    texto: 'Preciso de ajuda com estorno do cliente',
    db: pool,
    limit: 5
  });

  assert.ok(Array.isArray(results));
  assert.equal(results.length, 1);
  assert.equal(results[0].macro, 'Financeiro');
  assert.equal(results[0].item, 'Solicitação de estorno');
});

test('suggestFromText combina keywords e embeddings quando disponíveis', async () => {
  embeddingService.isFeatureEnabled = () => true;
  embeddingService.generateTextEmbedding = async () => [0.1, 0.2, 0.3];
  pool.query = async (text, params) => {
    if (text.includes('1 - (embedding <=>')) {
      assert.ok(Array.isArray(params));
      return {
        rows: [
          { id: 2, macro: 'Marketing & Growth', item: 'Link de indicação', similarity: 0.9 },
          { id: 1, macro: 'Financeiro', item: 'Solicitação de estorno', similarity: 0.4 }
        ]
      };
    }
    if (text.includes('FROM classificacao_catalogo')) {
      return { rows: catalogRows };
    }
    throw new Error('Query inesperada');
  };

  process.env.CLASSIFICACAO_VECTOR_WEIGHT = '0.5';

  const results = await classificacaoService.suggestFromText({
    texto: 'Cliente pediu link de indicação e precisa de ajuda',
    db: pool,
    limit: 5
  });

  assert.ok(results.length >= 1);
  assert.equal(results[0].macro, 'Marketing & Growth');
  assert.equal(results[0].item, 'Link de indicação');
  assert.ok(results[0].score > 0);
});

test('suggestFromText faz fallback para keywords quando embeddings falham', async () => {
  embeddingService.isFeatureEnabled = () => true;
  embeddingService.generateTextEmbedding = async () => {
    throw new Error('provider indisponível');
  };

  pool.query = async (text) => {
    if (text.includes('FROM classificacao_catalogo')) {
      return { rows: catalogRows };
    }
    // Quando o fallback acontece, a query vetorial não deve ser executada
    throw new Error('Query vetorial não deveria ser chamada');
  };

  const results = await classificacaoService.suggestFromText({
    texto: 'Estorno urgente para cliente especial',
    db: pool,
    limit: 5
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].macro, 'Financeiro');
});

test('merge de resultados mantém combinação com peso configurável', async () => {
  embeddingService.isFeatureEnabled = () => true;
  embeddingService.generateTextEmbedding = async () => [0.3, 0.2, 0.1];

  pool.query = async (text) => {
    if (text.includes('1 - (embedding <=>')) {
      return {
        rows: [
          { id: 2, macro: 'Marketing & Growth', item: 'Link de indicação', similarity: 0.95 }
        ]
      };
    }

    if (text.includes('FROM classificacao_catalogo')) {
      return { rows: catalogRows };
    }

    throw new Error('Query inesperada');
  };

  process.env.CLASSIFICACAO_VECTOR_WEIGHT = '0.5';

  const [result] = await classificacaoService.suggestFromText({
    texto: 'link de indicação para cliente vip',
    db: pool,
    limit: 1
  });

  assert.equal(result.macro, 'Marketing & Growth');
  assert.equal(result.item, 'Link de indicação');
  assert.ok(result.score > 40);
});
