const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

if (!process.env.DB_PASSWORD) {
  process.env.DB_PASSWORD = 'test';
}

const classificacaoController = require('../api/controllers/classificacao.controller');
const classificacaoService = require('../domain/services/classificacao.service');
const { ValidationError, NotFoundError } = require('../shared/errors/AppError');

const createMockRes = () => {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    }
  };
};

test('list retorna dados normalizados do serviço', async (t) => {
  const serviceResult = {
    data: [],
    total: 0,
    page: 1,
    pageSize: 20
  };

  mock.method(classificacaoService, 'list', async () => serviceResult);
  t.after(() => mock.restoreAll());

  const req = { query: { q: 'Fin' } };
  const res = createMockRes();

  await classificacaoController.list(req, res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 0);
  assert.equal(classificacaoService.list.mock.callCount(), 1);
});

test('create retorna 201 com payload do serviço', async (t) => {
  const record = {
    id: 10,
    macro: 'Financeiro',
    item: 'Chargeback',
    slug: 'financeiro-chargeback'
  };

  mock.method(classificacaoService, 'create', async () => record);
  t.after(() => mock.restoreAll());

  const req = {
    body: {
      macro: 'Financeiro',
      item: 'Chargeback',
      prioridade: 5
    },
    user: { id: 1 }
  };
  const res = createMockRes();

  await classificacaoController.create(req, res, () => {});

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.id, 10);
  assert.equal(classificacaoService.create.mock.calls[0].arguments[0].macro, 'Financeiro');
});

test('create encaminha ValidationError para next', async (t) => {
  const req = {
    body: { macro: 'A' }
  };
  const res = createMockRes();

  let forwardedError = null;
  await classificacaoController.create(req, res, (error) => {
    forwardedError = error;
  });

  assert.ok(forwardedError instanceof ValidationError);
});

test('update propaga erros de not found', async (t) => {
  mock.method(classificacaoService, 'update', async () => {
    throw new NotFoundError('Não encontrado');
  });
  t.after(() => mock.restoreAll());

  const req = {
    params: { id: '15' },
    body: { descricao: 'Nova descrição' },
    user: { id: 3 }
  };
  const res = createMockRes();
  let forwardedError = null;

  await classificacaoController.update(req, res, (error) => {
    forwardedError = error;
  });

  assert.ok(forwardedError instanceof NotFoundError);
});

test('toggle retorna registro atualizado', async (t) => {
  const toggled = {
    id: 3,
    ativo: false
  };

  mock.method(classificacaoService, 'toggle', async () => toggled);
  t.after(() => mock.restoreAll());

  const req = { params: { id: '3' }, user: { id: 9 } };
  const res = createMockRes();

  await classificacaoController.toggle(req, res, () => {});

  assert.equal(res.body.data.ativo, false);
  assert.equal(classificacaoService.toggle.mock.callCount(), 1);
});

test('remove realiza soft delete e retorna ok', async (t) => {
  mock.method(classificacaoService, 'softDelete', async () => {});
  t.after(() => mock.restoreAll());

  const req = { params: { id: '4' }, user: { id: 2 } };
  const res = createMockRes();

  await classificacaoController.remove(req, res, () => {});

  assert.equal(res.body.ok, true);
  assert.equal(classificacaoService.softDelete.mock.callCount(), 1);
});

test('importCsv envia linhas parseadas ao serviço', async (t) => {
  const report = [
    { line: 2, status: 'created', slug: 'financeiro-chargeback' }
  ];

  mock.method(classificacaoService, 'importCsv', async () => report);
  t.after(() => mock.restoreAll());

  const csvContent = [
    'macro,item,descricao,cor_hex,prioridade,ativo',
    'Financeiro,Chargeback,Disputa,#ff0000,10,true'
  ].join('\n');

  const req = {
    file: {
      buffer: Buffer.from(csvContent, 'utf-8')
    },
    user: { id: 5 }
  };
  const res = createMockRes();

  await classificacaoController.importCsv(req, res, () => {});

  assert.equal(res.body.ok, true);
  const rowsArg = classificacaoService.importCsv.mock.calls[0].arguments[0];
  assert.equal(rowsArg[0].macro, 'Financeiro');
  assert.equal(rowsArg[0].line, 2);
});

test('importCsv sem arquivo chama next com ValidationError', async (t) => {
  const req = {};
  const res = createMockRes();
  let forwardedError = null;

  await classificacaoController.importCsv(req, res, (error) => {
    forwardedError = error;
  });

  assert.ok(forwardedError instanceof ValidationError);
});

test('exportCsv define headers e envia texto', async (t) => {
  mock.method(classificacaoService, 'exportCsv', async () => 'macro,item\nFinanceiro,Chargeback');
  t.after(() => mock.restoreAll());

  const req = {};
  const res = createMockRes();

  await classificacaoController.exportCsv(req, res, () => {});

  assert.equal(res.headers['Content-Type'], 'text/csv; charset=utf-8');
  assert.equal(res.headers['Content-Disposition'], 'attachment; filename="classificacoes.csv"');
  assert.ok(res.body.includes('Financeiro'));
});
