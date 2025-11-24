const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

if (!process.env.DB_PASSWORD) {
  process.env.DB_PASSWORD = 'test';
}

if (!require.extensions['.ts']) {
  require.extensions['.ts'] = require.extensions['.js'];
}

const auditoriaService = require('../domain/services/auditoria.service.ts');
const auditoriaRepository = require('../domain/repositories/auditoria.repository.ts');
const { ValidationError, ForbiddenError } = require('../shared/errors/AppError');

test('concludeAuditoria rejeita quando quantidade informada diverge do período', async (t) => {
  const periodoInicio = new Date('2024-05-01T10:00:00Z');
  const periodoFim = new Date('2024-05-01T10:05:00Z');

  const periodMock = mock.method(auditoriaRepository, 'getConversationPeriod', async () => ({
    conversa: { id: 10 },
    periodoInicio,
    periodoFimPreview: periodoFim,
    totalMensagens: 5
  }));

  const insertMock = mock.method(auditoriaRepository, 'insertAuditoria', async () => 99);
  const getMock = mock.method(auditoriaRepository, 'getAuditoriaById', async () => null);

  t.after(() => {
    mock.restoreAll();
  });

  await assert.rejects(
    async () => auditoriaService.concludeAuditoria({
      conversa_id: 10,
      data_inicio: periodoInicio.toISOString(),
      data_fim: periodoFim.toISOString(),
      usuario_id: 4,
      qtd_mensagens: 3,
      observacao: 'teste'
    }, {
      user: { id: 4, role: 'auditor' },
      requestIp: '127.0.0.1',
      userAgent: 'test-agent'
    }),
    (error) => error instanceof ValidationError
  );

  assert.equal(insertMock.mock.callCount(), 0);
});

test('reabrirAuditoria exige perfil autorizado', async () => {
  await assert.rejects(
    async () => auditoriaService.reabrirAuditoria({ auditoriaId: 1, usuario: { id: 1, role: 'atendente' } }),
    (error) => error instanceof ForbiddenError
  );
});
