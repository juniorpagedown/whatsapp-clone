const test = require('node:test');
const assert = require('node:assert/strict');

if (!process.env.DB_PASSWORD) {
  process.env.DB_PASSWORD = 'test';
}

if (!require.extensions['.ts']) {
  require.extensions['.ts'] = require.extensions['.js'];
}

const auditoriaRepository = require('../domain/repositories/auditoria.repository.ts');
const pool = require('../infrastructure/database/postgres');
const logger = require('../shared/config/logger.config');
const { NotFoundError } = require('../shared/errors/AppError');

const noop = () => {};

test('listRecentConversations retorna dados normalizados', async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => ({
    rows: [{
      conversa_id: 7,
      conversa_chat_id: '123@g.us',
      conversa_tipo: 'grupo',
      conversa_nome: 'Grupo Teste',
      periodo_inicio: new Date('2024-05-01T10:00:00Z'),
      ultima_mensagem_timestamp: new Date('2024-05-01T10:05:00Z'),
      novas_no_periodo: 5,
      total_count: 1
    }]
  });

  t.after(() => {
    pool.query = originalQuery;
  });

  const result = await auditoriaRepository.listRecentConversations({ limit: 10, offset: 0 });

  assert.equal(result.total, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].novasNoPeriodo, 5);
  assert.equal(result.items[0].conversa.id, 7);
});

test('getConversationPeriod dispara NotFoundError para conversas inexistentes', async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [] });

  t.after(() => {
    pool.query = originalQuery;
  });

  await assert.rejects(
    async () => auditoriaRepository.getConversationPeriod(99, new Date()),
    (error) => error instanceof NotFoundError
  );
});

test('insertAuditoria executa transação e registra auditoria', async (t) => {
  const originalConnect = pool.connect;
  const originalLogger = logger.info;
  logger.info = noop;

  const calls = [];
  const mockClient = {
    query: async (sql, params) => {
      const text = typeof sql === 'string' ? sql.trim() : sql;
      calls.push({ sql: text, params });

      if (text.startsWith('INSERT INTO auditorias')) {
        return { rows: [{ id: 321 }] };
      }

      return { rows: [] };
    },
    release: () => {
      calls.push({ sql: 'RELEASE' });
    }
  };

  pool.connect = async () => mockClient;

  t.after(() => {
    pool.connect = originalConnect;
    logger.info = originalLogger;
  });

  const insertedId = await auditoriaRepository.insertAuditoria({
    conversaId: 42,
    dataInicio: new Date('2024-05-01T10:00:00Z'),
    dataFim: new Date('2024-05-01T10:05:00Z'),
    usuarioId: 7,
    qtdMensagens: 12,
    observacao: 'ok',
    status: 'concluida',
    metadata: { fonte: 'teste' }
  });

  assert.equal(insertedId, 321);
  const beginCall = calls.find((entry) => entry.sql === 'BEGIN');
  const commitCall = calls.find((entry) => entry.sql === 'COMMIT');
  assert.ok(beginCall, 'espera que BEGIN seja chamado');
  assert.ok(commitCall, 'espera que COMMIT seja chamado');

  const updateCall = calls.find((entry) => entry.sql.includes('UPDATE conversas'));
  assert.ok(updateCall, 'espera atualização de conversas');
  assert.equal(updateCall.params[0], 42);
});
