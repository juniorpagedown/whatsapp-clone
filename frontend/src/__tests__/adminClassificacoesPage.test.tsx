import React, { act, StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import AdminClassificacoesPage from '../routes/AdminClassificacoesPage.tsx';
import * as api from '../services/classificationApi.ts';

vi.mock('../components/Header.jsx', () => ({
  default: () => <div data-testid="mock-header" />
}));

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AdminClassificacoesPage', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    vi.restoreAllMocks();
  });

  it('renderiza lista e permite toggle de ativo', async () => {
    const initialItem: api.ClassificacaoCatalogoItem = {
      id: 1,
      macro: 'Financeiro',
      item: 'Chargeback',
      slug: 'financeiro-chargeback',
      descricao: null,
      cor_hex: '#ff0000',
      prioridade: 10,
      ativo: true,
      deleted_at: null,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z'
    };

    vi.spyOn(api, 'listClassificacoes')
      .mockResolvedValueOnce({ data: [initialItem], total: 1, page: 1, pageSize: 20 })
      .mockResolvedValueOnce({
        data: [{ ...initialItem, ativo: false }], total: 1, page: 1, pageSize: 20
      });
    vi.spyOn(api, 'toggleClassificacao').mockResolvedValue({ ...initialItem, ativo: false });

    await act(async () => {
      root.render(
        <StrictMode>
          <MemoryRouter>
            <AdminClassificacoesPage />
          </MemoryRouter>
        </StrictMode>
      );
      await flushPromises();
    });

    const toggleButton = Array.from(container.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Desativar');
    expect(toggleButton).toBeTruthy();

    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
    });

    expect(api.toggleClassificacao).toHaveBeenCalledWith(1);
    expect(api.listClassificacoes).toHaveBeenCalledTimes(2);
  });

  it('cria uma nova classificação pelo formulário', async () => {
    const createdItem: api.ClassificacaoCatalogoItem = {
      id: 2,
      macro: 'Marketing',
      item: 'Campanha',
      slug: 'marketing-campanha',
      descricao: null,
      cor_hex: null,
      prioridade: 0,
      ativo: true,
      deleted_at: null,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z'
    };

    vi.spyOn(api, 'listClassificacoes')
      .mockResolvedValueOnce({ data: [], total: 0, page: 1, pageSize: 20 })
      .mockResolvedValueOnce({ data: [createdItem], total: 1, page: 1, pageSize: 20 });
    const createSpy = vi.spyOn(api, 'createClassificacao').mockResolvedValue(createdItem);

    await act(async () => {
      root.render(
        <StrictMode>
          <MemoryRouter>
            <AdminClassificacoesPage />
          </MemoryRouter>
        </StrictMode>
      );
      await flushPromises();
    });

    const createButton = Array.from(container.querySelectorAll('button'))
      .find((btn) => btn.textContent === 'Nova');
    expect(createButton).toBeTruthy();

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
    });

    const modal = container.querySelector('div[role="dialog"]');
    expect(modal).toBeTruthy();

    const macroInput = modal?.querySelector('input[name="macro"]') as HTMLInputElement | undefined;
    const itemInput = modal?.querySelector('input[name="item"]') as HTMLInputElement | undefined;
    const prioridadeInput = modal?.querySelector('input[name="prioridade"]') as HTMLInputElement | undefined;

    expect(macroInput).toBeTruthy();
    expect(itemInput).toBeTruthy();
    expect(prioridadeInput).toBeTruthy();

    await act(async () => {
      if (macroInput) {
        macroInput.value = 'Marketing';
        macroInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (itemInput) {
        itemInput.value = 'Campanha';
        itemInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (prioridadeInput) {
        prioridadeInput.value = '0';
        prioridadeInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    const form = modal?.querySelector('form') as HTMLFormElement | undefined;
    expect(form).toBeTruthy();

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flushPromises();

    expect(createSpy).toHaveBeenCalledWith({
      macro: 'Marketing',
      item: 'Campanha',
      prioridade: 0,
      ativo: true
    });
    expect(api.listClassificacoes).toHaveBeenCalledTimes(2);
  });
});
