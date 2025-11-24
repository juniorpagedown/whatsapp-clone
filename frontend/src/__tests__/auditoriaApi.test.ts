import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchRecentConversations,
  fetchNonAuditedConversations,
  concludeAudit
} from '../services/auditoriaApi.ts';

const jsonHeaders = {
  get: (key: string) => (key.toLowerCase() === 'content-type' ? 'application/json' : null)
};

describe('auditoriaApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchRecentConversations retorna itens normalizados', async () => {
    const mockResponse = {
      data: [{
        conversa: { id: 1, nome: 'Conversa Teste' },
        periodoInicio: '2024-05-01T10:00:00Z',
        ultimaMensagem: '2024-05-01T10:05:00Z',
        novasNoPeriodo: 3
      }],
      pagination: { page: 1, pageSize: 10, total: 1 }
    };

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: jsonHeaders,
      json: async () => mockResponse
    } as unknown as Response);

    const result = await fetchRecentConversations(1, 10);

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auditoria/conversas-recentes?page=1&pageSize=10',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].novasNoPeriodo).toBe(3);
    expect(result.pagination.total).toBe(1);
  });

  it('concludeAudit propaga erro da API', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      headers: jsonHeaders,
      json: async () => ({ error: { message: 'Falha' } })
    } as unknown as Response);

    await expect(concludeAudit({
      conversa_id: 1,
      data_inicio: '2024-05-01T10:00:00Z',
      data_fim: '2024-05-01T10:05:00Z',
      usuario_id: 5,
      qtd_mensagens: 3
    })).rejects.toThrow('Falha');
  });

  it('fetchNonAuditedConversations inclui parâmetro tipo quando informado', async () => {
    const mockResponse = {
      data: [],
      pagination: { page: 1, pageSize: 50, total: 0 }
    };

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: jsonHeaders,
      json: async () => mockResponse
    } as unknown as Response);

    await fetchNonAuditedConversations(1, 50, 'grupo');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auditoria/conversas-nao-auditadas?page=1&pageSize=50&tipo=grupo',
      expect.objectContaining({ method: 'GET' })
    );
  });
});
