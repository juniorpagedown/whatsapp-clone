const test = require('node:test');
const assert = require('node:assert/strict');

if (!process.env.DB_PASSWORD) {
  process.env.DB_PASSWORD = 'test';
}

const pool = require('../infrastructure/database/postgres');
const classificacaoService = require('../domain/services/classificacao.service');
const { ConflictError, NotFoundError } = require('../shared/errors/AppError');

const sampleSelectRow = {
  id: 1,
  macro: 'Financeiro',
  item: 'Chargeback',
  slug: 'financeiro-chargeback',
  descricao: 'Disputa de cartão',
  cor_hex: '#ff0000',
  prioridade: 10,
  ativo: true,
  deleted_at: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-02T00:00:00.000Z'
};

const normalizeSql = (sql) => sql.replace(/\s+/g, ' ').trim();

test('list aplica filtros e ordenação nas consultas', async (t) => {
  const originalQuery = pool.query;
  const executed = [];

  pool.query = async (text, params) => {
    const sql = normalizeSql(text);
    executed.push({ sql, params });

    if (sql.startsWith('SELECT COUNT(*)')) {
      assert.ok(sql.includes('deleted_at IS NULL'));
      assert.ok(sql.includes('ativo = TRUE'));
      assert.ok(sql.includes('ILIKE'));
      return { rows: [{ total: '1' }] };
    }

    if (sql.startsWith('SELECT id,')) {
      assert.ok(sql.includes('ORDER BY macro DESC'));
      return { rows: [sampleSelectRow] };
    }

    throw new Error(`Query inesperada: ${sql}`);
  };

  t.after(() => {
    pool.query = originalQuery;
  });

  const result = await classificacaoService.list({
    q: 'Fin',
    ativo: 'true',
    page: 2,
    pageSize: 10,
    sort: 'macro:desc'
  });

  assert.equal(result.total, 1);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 10);
  assert.equal(result.data[0].slug, 'financeiro-chargeback');
  assert.equal(executed.length, 2);
});

test('create gera slug único e registra auditoria', async (t) => {
  const originalConnect = pool.connect;
  const calls = [];

  const mockClient = {
    async query(text, params) {
      const sql = normalizeSql(text);
      calls.push({ sql, params });

      if (sql === 'BEGIN' || sql === 'COMMIT') {
        return { rows: [] };
      }

      if (sql.startsWith('SELECT 1 FROM classificacao_catalogo WHERE slug')) {
        return { rows: [] };
      }

      if (sql.startsWith('INSERT INTO classificacao_catalogo')) {
        return {
          rows: [{
            id: 5,
            macro: 'Financeiro',
            item: 'Chargeback',
            slug: 'financeiro-chargeback',
            descricao: null,
            cor_hex: null,
            prioridade: 0,
            ativo: true,
            deleted_at: null,
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z'
          }]
        };
      }

      if (sql.startsWith('INSERT INTO audit_logs')) {
        return { rows: [] };
      }

      throw new Error(`Query inesperada: ${sql}`);
    },
    release: () => {
      calls.push({ sql: 'RELEASE' });
    }
  };

  pool.connect = async () => mockClient;

  t.after(() => {
    pool.connect = originalConnect;
  });

  const result = await classificacaoService.create(
    { macro: 'Financeiro', item: 'Chargeback' },
    { id: 9 }
  );

  assert.equal(result.slug, 'financeiro-chargeback');
  const auditCall = calls.find((entry) => entry.sql.startsWith('INSERT INTO audit_logs'));
  assert.ok(auditCall, 'espera registro de audit log');
});

test('create lança ConflictError em violação de unicidade', async (t) => {
  const originalConnect = pool.connect;

  const mockClient = {
    async query(text) {
      const sql = normalizeSql(text);

      if (sql === 'BEGIN' || sql === 'ROLLBACK') {
        return { rows: [] };
      }

      if (sql.startsWith('SELECT 1 FROM classificacao_catalogo WHERE slug')) {
        return { rows: [] };
      }

      if (sql.startsWith('INSERT INTO classificacao_catalogo')) {
        const error = new Error('duplicate');
        error.code = '23505';
        throw error;
      }

      if (sql.startsWith('INSERT INTO audit_logs')) {
        return { rows: [] };
      }

      return { rows: [] };
    },
    release: () => {}
  };

  pool.connect = async () => mockClient;

  t.after(() => {
    pool.connect = originalConnect;
  });

  await assert.rejects(
    async () => classificacaoService.create({ macro: 'Financeiro', item: 'Duplicado' }, { id: 2 }),
    (error) => error instanceof ConflictError
  );
});

test('update regenera slug quando macro muda', async (t) => {
  const originalConnect = pool.connect;
  const calls = [];

  const existing = {
    id: 7,
    macro: 'Financeiro',
    item: 'Chargeback',
    slug: 'financeiro-chargeback',
    descricao: null,
    cor_hex: null,
    prioridade: 0,
    ativo: true,
    deleted_at: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-02T00:00:00.000Z'
  };

  const mockClient = {
    async query(text, params) {
      const sql = normalizeSql(text);
      calls.push({ sql, params });

      if (sql === 'BEGIN' || sql === 'COMMIT') {
        return { rows: [] };
      }

      if (sql.startsWith('SELECT id,')) {
        return { rows: [existing] };
      }

      if (sql.startsWith('SELECT 1 FROM classificacao_catalogo WHERE slug = $1 AND id <> $2')) {
        return { rows: [] };
      }

      if (sql.startsWith('UPDATE classificacao_catalogo')) {
        return {
          rows: [{
            ...existing,
            macro: 'Atendimento',
            slug: 'atendimento-chargeback',
            updated_at: '2024-02-01T00:00:00.000Z'
          }]
        };
      }

      if (sql.startsWith('INSERT INTO audit_logs')) {
        return { rows: [] };
      }

      throw new Error(`Query inesperada: ${sql}`);
    },
    release: () => {}
  };

  pool.connect = async () => mockClient;

  t.after(() => {
    pool.connect = originalConnect;
  });

  const result = await classificacaoService.update(7, { macro: 'Atendimento' }, { id: 1 });

  assert.equal(result.slug, 'atendimento-chargeback');
  const slugCheck = calls.find((entry) => entry.sql.startsWith('SELECT 1 FROM classificacao_catalogo WHERE slug = $1 AND id <> $2'));
  assert.ok(slugCheck);
});

test('toggle alterna campo ativo e audita', async (t) => {
  const originalConnect = pool.connect;
  const calls = [];

  const existing = {
    id: 8,
    macro: 'Financeiro',
    item: 'Chargeback',
    slug: 'financeiro-chargeback',
    descricao: null,
    cor_hex: null,
    prioridade: 0,
    ativo: true,
    deleted_at: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-02T00:00:00.000Z'
  };

  const mockClient = {
    async query(text, params) {
      const sql = normalizeSql(text);
      calls.push({ sql, params });

      if (sql === 'BEGIN' || sql === 'COMMIT') {
        return { rows: [] };
      }

      if (sql.startsWith('SELECT id,')) {
        return { rows: [existing] };
      }

      if (sql.startsWith('UPDATE classificacao_catalogo')) {
        return {
          rows: [{ ...existing, ativo: false, updated_at: '2024-03-01T00:00:00.000Z' }]
        };
      }

      if (sql.startsWith('INSERT INTO audit_logs')) {
        return { rows: [] };
      }

      throw new Error(`Query inesperada: ${sql}`);
    },
    release: () => {}
  };

  pool.connect = async () => mockClient;

  t.after(() => {
    pool.connect = originalConnect;
  });

  const result = await classificacaoService.toggle(8, { id: 3 });
  assert.equal(result.ativo, false);
  const auditCall = calls.find((entry) => entry.sql.startsWith('INSERT INTO audit_logs'));
  assert.ok(auditCall);
});

test('softDelete marca registro como removido', async (t) => {
  const originalConnect = pool.connect;

  const existing = {
    id: 9,
    macro: 'Financeiro',
    item: 'Chargeback',
    slug: 'financeiro-chargeback',
    descricao: null,
    cor_hex: null,
    prioridade: 0,
    ativo: true,
    deleted_at: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-02T00:00:00.000Z'
  };

  const mockClient = {
    async query(text, params) {
      const sql = normalizeSql(text);

      if (sql === 'BEGIN' || sql === 'COMMIT') {
        return { rows: [] };
      }

      if (sql.startsWith('SELECT id,')) {
        return { rows: [existing] };
      }

      if (sql.startsWith('UPDATE classificacao_catalogo')) {
        return {
          rows: [{ ...existing, ativo: false, deleted_at: '2024-04-01T00:00:00.000Z', updated_at: '2024-04-01T00:00:00.000Z' }]
        };
      }

      if (sql.startsWith('INSERT INTO audit_logs')) {
        return { rows: [] };
      }

      throw new Error(`Query inesperada: ${sql}`);
    },
    release: () => {}
  };

  pool.connect = async () => mockClient;

  t.after(() => {
    pool.connect = originalConnect;
  });

  const result = await classificacaoService.softDelete(9, { id: 4 });
  assert.equal(result.ativo, false);
  assert.ok(result.deleted_at);
});

test('softDelete lança NotFoundError quando inexistente', async (t) => {
  const originalConnect = pool.connect;

  const mockClient = {
    async query(text) {
      const sql = normalizeSql(text);

      if (sql === 'BEGIN' || sql === 'ROLLBACK') {
        return { rows: [] };
      }

      if (sql.startsWith('SELECT id,')) {
        return { rows: [] };
      }

      return { rows: [] };
    },
    release: () => {}
  };

  pool.connect = async () => mockClient;

  t.after(() => {
    pool.connect = originalConnect;
  });

  await assert.rejects(
    async () => classificacaoService.softDelete(999, { id: 7 }),
    (error) => error instanceof NotFoundError
  );
});

test('importCsv cria e atualiza registros', async (t) => {
  const originalConnect = pool.connect;
  const calls = [];
  let slugLookupCount = 0;

  const existingRow = {
    id: 12,
    macro: 'Operação',
    item: 'Lote',
    slug: 'operacao-lote',
    descricao: 'Antigo',
    cor_hex: '#111111',
    prioridade: 5,
    ativo: true,
    deleted_at: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-02T00:00:00.000Z'
  };

  const mockClient = {
    async query(text, params) {
      const sql = normalizeSql(text);
      calls.push({ sql, params });

      if (sql === 'BEGIN' || sql === 'COMMIT') {
        return { rows: [] };
      }

      if (sql.includes('WHERE slug = $1 FOR UPDATE')) {
        slugLookupCount += 1;
        if (slugLookupCount === 1) {
          return { rows: [] };
        }
        return { rows: [existingRow] };
      }

      if (sql.startsWith('SELECT 1 FROM classificacao_catalogo WHERE slug = $1')) {
        return { rows: [] };
      }

      if (sql.includes('WHERE macro = $1 AND item = $2')) {
        return { rows: [] };
      }

      if (sql.startsWith('INSERT INTO classificacao_catalogo')) {
        return {
          rows: [{
            id: 20,
            macro: 'Financeiro',
            item: 'Chargeback',
            slug: 'financeiro-chargeback',
            descricao: 'Disputa de cartão',
            cor_hex: '#ef4444',
            prioridade: 10,
            ativo: true,
            deleted_at: null,
            created_at: '2024-05-01T00:00:00.000Z',
            updated_at: '2024-05-01T00:00:00.000Z'
          }]
        };
      }

      if (sql.startsWith('UPDATE classificacao_catalogo')) {
        return {
          rows: [{
            ...existingRow,
            descricao: 'Atualizado',
            prioridade: 15,
            updated_at: '2024-05-02T00:00:00.000Z'
          }]
        };
      }

      if (sql.startsWith('INSERT INTO audit_logs')) {
        return { rows: [] };
      }

      if (sql === 'ROLLBACK') {
        return { rows: [] };
      }

      throw new Error(`Query inesperada: ${sql}`);
    },
    release: () => {}
  };

  pool.connect = async () => mockClient;

  t.after(() => {
    pool.connect = originalConnect;
  });

  const report = await classificacaoService.importCsv([
    {
      line: 2,
      macro: 'Financeiro',
      item: 'Chargeback',
      descricao: 'Disputa de cartão',
      cor_hex: '#ef4444',
      prioridade: '10',
      ativo: 'true'
    },
    {
      line: 3,
      macro: 'Operação',
      item: 'Lote',
      descricao: 'Atualizado',
      cor_hex: '#222222',
      prioridade: '15',
      ativo: 'true'
    }
  ], { id: 6 });

  assert.equal(report.length, 2);
  assert.equal(report[0].status, 'created');
  assert.equal(report[0].slug, 'financeiro-chargeback');
  assert.equal(report[1].status, 'updated');
  assert.equal(report[1].slug, 'operacao-lote');
});

test('importCsv registra erro para linha inválida', async (t) => {
  const originalConnect = pool.connect;
  const mockClient = {
    async query() {
      throw new Error('Não deveria consultar banco');
    },
    release: () => {}
  };

  pool.connect = async () => mockClient;

  t.after(() => {
    pool.connect = originalConnect;
  });

  const report = await classificacaoService.importCsv([
    { line: 2, macro: '', item: '', prioridade: '1' }
  ], { id: 1 });

  assert.equal(report[0].status, 'error');
});

test('exportCsv retorna texto CSV com cabeçalho', async (t) => {
  const originalQuery = pool.query;

  pool.query = async () => ({
    rows: [
      {
        macro: 'Financeiro',
        item: 'Chargeback',
        descricao: 'Disputa',
        cor_hex: '#ff0000',
        prioridade: 10,
        ativo: true
      }
    ]
  });

  t.after(() => {
    pool.query = originalQuery;
  });

  const csv = await classificacaoService.exportCsv();
  const lines = csv.split('\n');
  assert.equal(lines[0], 'macro,item,descricao,cor_hex,prioridade,ativo');
  assert.ok(lines[1].includes('Financeiro'));
});
