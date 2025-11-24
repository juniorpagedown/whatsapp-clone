const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

if (!process.env.DB_PASSWORD) {
  process.env.DB_PASSWORD = 'test';
}

process.env.FEATURE_EMBEDDING = 'true';

const pool = require('../infrastructure/database/postgres');
const embeddingService = require('../domain/services/embedding.service');
const conversaContextoService = require('../domain/services/conversaContexto.service.js');

test('listByConversa aplica filtros e retorna metadados', async (t) => {
  const sampleRows = [
    {
      id: 1,
      conversa_id: 42,
      periodo_inicio: '2024-01-10T10:00:00Z',
      periodo_fim: '2024-01-10T11:00:00Z',
      total_mensagens: 12,
      resumo: 'Cliente questionou status de entrega.',
      temas_principais: ['Logística', 'Entrega'],
      created_at: '2024-01-10T11:05:00Z'
    },
    {
      id: 2,
      conversa_id: 42,
      periodo_inicio: '2024-01-08T09:00:00Z',
      periodo_fim: '2024-01-08T10:00:00Z',
      total_mensagens: 9,
      resumo: 'Negociação sobre prazo adicional.',
      temas_principais: ['Prazo'],
      created_at: '2024-01-08T10:10:00Z'
    }
  ];

  mock.method(pool, 'query', async (sql) => {
    if (/COUNT\(\*\)/i.test(sql)) {
      return { rows: [{ total: sampleRows.length }] };
    }
    if (/FROM conversa_contexto/i.test(sql)) {
      return { rows: sampleRows };
    }
    throw new Error('Unexpected query in test');
  });

  t.after(() => {
    mock.restoreAll();
  });

  const result = await conversaContextoService.listByConversa({
    conversaId: 42,
    limit: 10,
    offset: 0,
    from: '2024-01-01T00:00:00Z',
    to: '2024-01-31T23:59:59Z',
    sort: 'recent'
  });

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].id, 1);
  assert.equal(result.items[0].temas_principais[0], 'Logística');
  assert.equal(result.count, 2);
  assert.equal(result.limit, 10);
  assert.equal(result.offset, 0);
  assert.equal(result.hasMore, false);
  assert.equal(result.sort, 'recent');
});

test('searchSimilarByConversa ordena por score_sim ascendente', async (t) => {
  const sampleRows = [
    {
      id: 3,
      conversa_id: 42,
      periodo_inicio: '2024-02-01T09:00:00Z',
      periodo_fim: '2024-02-01T09:30:00Z',
      total_mensagens: 7,
      resumo: 'Discutido reembolso parcial.',
      temas_principais: ['Financeiro'],
      created_at: '2024-02-01T09:35:00Z',
      score_sim: 0.12
    },
    {
      id: 4,
      conversa_id: 42,
      periodo_inicio: '2024-01-20T14:00:00Z',
      periodo_fim: '2024-01-20T14:20:00Z',
      total_mensagens: 5,
      resumo: 'Cliente perguntou sobre política de reembolso.',
      temas_principais: ['Financeiro', 'Política'],
      created_at: '2024-01-20T14:25:00Z',
      score_sim: 0.34
    }
  ];

  mock.method(pool, 'query', async (sql) => {
    if (/vector_dims/i.test(sql)) {
      return { rows: [{ dimension: 3 }] };
    }
    if (/COUNT\(\*\)/i.test(sql)) {
      return { rows: [{ total: sampleRows.length }] };
    }
    if (/ORDER BY score_sim ASC/i.test(sql)) {
      return { rows: sampleRows };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  mock.method(embeddingService, 'generateTextEmbedding', async () => [0.1, 0.2, 0.3]);

  t.after(() => {
    mock.restoreAll();
  });

  const result = await conversaContextoService.searchSimilarByConversa({
    conversaId: 42,
    queryText: 'reembolso atrasado',
    limit: 5,
    offset: 0
  });

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].id, 3);
  assert.ok(result.items[0].score_sim <= result.items[1].score_sim);
  assert.equal(result.sort, 'sim');
});
