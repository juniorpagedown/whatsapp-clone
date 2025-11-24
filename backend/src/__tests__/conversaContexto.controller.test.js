const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

if (!process.env.DB_PASSWORD) {
  process.env.DB_PASSWORD = 'test';
}

process.env.FEATURE_EMBEDDING = 'true';

const conversaContextoController = require('../api/controllers/conversaContexto.controller.js');
const conversaContextoService = require('../domain/services/conversaContexto.service.js');

const createMockRes = () => {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
};

test('listConversationContexts retorna lista paginada com ordenação recent', async (t) => {
  const serviceResult = {
    items: [
      {
        id: 1,
        conversa_id: 7,
        periodo_inicio: '2024-01-10T10:00:00Z',
        periodo_fim: '2024-01-10T10:30:00Z',
        total_mensagens: 10,
        resumo: 'Resumo teste',
        temas_principais: ['Tema'],
        created_at: '2024-01-10T10:31:00Z'
      },
      {
        id: 2,
        conversa_id: 7,
        periodo_inicio: '2024-01-09T09:00:00Z',
        periodo_fim: '2024-01-09T09:20:00Z',
        total_mensagens: 5,
        resumo: 'Outro resumo',
        temas_principais: [],
        created_at: '2024-01-09T09:25:00Z'
      },
      {
        id: 3,
        conversa_id: 7,
        periodo_inicio: '2024-01-08T08:00:00Z',
        periodo_fim: '2024-01-08T08:15:00Z',
        total_mensagens: 3,
        resumo: 'Terceiro resumo',
        temas_principais: ['Financeiro'],
        created_at: '2024-01-08T08:20:00Z'
      }
    ],
    count: 3,
    limit: 20,
    offset: 0,
    hasMore: false,
    durationMs: 12,
    sort: 'recent'
  };

  mock.method(conversaContextoService, 'listByConversa', async () => serviceResult);
  t.after(() => mock.restoreAll());

  const req = {
    params: { conversaId: 7 },
    query: {
      limit: 20,
      offset: 0,
      sort: 'recent'
    }
  };
  const res = createMockRes();

  await conversaContextoController.listConversationContexts(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.length, 3);
  assert.equal(res.body.meta.count, 3);
  assert.equal(res.body.meta.sort, 'recent');
  assert.equal(conversaContextoService.listByConversa.mock.callCount(), 1);
});

test('listConversationContexts delega para busca por similaridade quando sort=sim', async (t) => {
  const serviceResult = {
    items: [
      {
        id: 11,
        conversa_id: 99,
        periodo_inicio: '2024-02-02T10:00:00Z',
        periodo_fim: '2024-02-02T10:20:00Z',
        total_mensagens: 6,
        resumo: 'Similaridade alta',
        temas_principais: ['Reembolso'],
        created_at: '2024-02-02T10:21:00Z',
        score_sim: 0.15
      }
    ],
    count: 1,
    limit: 5,
    offset: 0,
    hasMore: false,
    durationMs: 9,
    embeddingMs: 5,
    sort: 'sim'
  };

  mock.method(conversaContextoService, 'listByConversa', async () => {
    throw new Error('listByConversa não deveria ser chamado');
  });
  mock.method(conversaContextoService, 'searchSimilarByConversa', async () => serviceResult);
  t.after(() => mock.restoreAll());

  const req = {
    params: { conversaId: 99 },
    query: {
      limit: 5,
      offset: 0,
      sort: 'sim',
      q: 'reembolso'
    }
  };
  const res = createMockRes();

  await conversaContextoController.listConversationContexts(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data[0].score_sim, 0.15);
  assert.equal(res.body.meta.sort, 'sim');
  assert.equal(conversaContextoService.searchSimilarByConversa.mock.callCount(), 1);
});

test('listConversationsWithSummary retorna agregados', async (t) => {
  const sample = [
    { conversa_id: 1, chat_id: '123@g.us', tipo: 'grupo', nome: 'Grupo 123', total_contextos: 2 }
  ];

  mock.method(conversaContextoService, 'listConversationsWithContext', async () => sample);
  t.after(() => mock.restoreAll());

  const req = {};
  const res = createMockRes();

  await conversaContextoController.listConversationsWithSummary(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, sample);
});
