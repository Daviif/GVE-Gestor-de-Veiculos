import type { UsuarioSessao } from '@gve/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Rotas } from './App';
import { ProvedorSessao } from './auth/sessao';
import { dataComSemana } from './datas';
import { ProvedorToast } from './toast/ProvedorToast';

const admin: UsuarioSessao = {
  id: 1,
  nome: 'Administrador',
  email: 'admin@gve.local',
  perfil: 'ADMINISTRADOR',
  trocaSenhaObrigatoria: false,
};

function json(status: number, corpo?: unknown) {
  return Promise.resolve(
    new Response(corpo === undefined ? null : JSON.stringify(corpo), { status }),
  );
}

/** Simula a API: `responder` recebe o método e o caminho; sem resposta vira 404. */
function simular(responder: (metodo: string, caminho: string) => Promise<Response> | undefined) {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const caminho = url.replace('/api/v1', '');
    return (
      responder(init?.method ?? 'GET', caminho) ??
      json(404, { erro: { codigo: 'NAO_ENCONTRADO', mensagem: '' } })
    );
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function abrir(caminho: string) {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <ProvedorToast>
        <ProvedorSessao>
          <Rotas />
        </ProvedorSessao>
      </ProvedorToast>
    </MemoryRouter>,
  );
}

function preencher(rotulo: string, valor: string) {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
}

/** Corpo JSON da chamada que bate com o método e a URL. */
function corpoDa(fetch: ReturnType<typeof simular>, metodo: string, url: string) {
  const chamada = fetch.mock.calls.find(([u, init]) => u === url && init?.method === metodo);
  return JSON.parse(chamada![1]!.body as string);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const argo = { id: 1, placa: 'ABC1234', modelo: 'Fiat Argo', ativo: true, reservasFuturas: 2 };
const onix = { id: 2, placa: 'XYZ9A87', modelo: 'Onix', ativo: false, reservasFuturas: 0 };

const sessaoDoAdmin = (metodo: string, caminho: string) =>
  metodo === 'GET' && caminho === '/auth/me' ? json(200, { usuario: admin }) : undefined;

describe('Veículos (administração)', () => {
  it('lista a frota com placa, situação e reservas futuras', async () => {
    simular((metodo, caminho) => {
      if (metodo === 'GET' && caminho === '/veiculos') {
        return json(200, { veiculos: [argo, onix] });
      }
      return sessaoDoAdmin(metodo, caminho);
    });
    abrir('/admin/veiculos');

    const cartao = await screen.findByRole('listitem', { name: 'Fiat Argo ABC1234' });
    expect(cartao.textContent).toContain('ABC-1234');
    expect(cartao.textContent).toContain('Ativo');
    expect(cartao.textContent).toContain('2 reservas futuras');

    const desativado = screen.getByRole('listitem', { name: 'Onix XYZ9A87' });
    expect(desativado.textContent).toContain('XYZ-9A87');
    expect(desativado.textContent).toContain('Desativado');
    expect(within(desativado).getByRole('button', { name: 'Reativar' })).toBeTruthy();
  });

  it('cadastra com a placa em qualquer formato e mostra o novo veículo', async () => {
    const fetch = simular((metodo, caminho) => {
      if (metodo === 'GET' && caminho === '/veiculos') return json(200, { veiculos: [] });
      if (metodo === 'POST' && caminho === '/veiculos') {
        return json(201, {
          veiculo: {
            id: 3,
            placa: 'ABC1D23',
            modelo: 'Fiat Mobi',
            ativo: true,
            reservasFuturas: 0,
          },
        });
      }
      return sessaoDoAdmin(metodo, caminho);
    });
    abrir('/admin/veiculos');
    await screen.findByText('Nenhum veículo cadastrado.');
    expect(screen.queryByLabelText('Placa')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '+ Cadastrar veículo' }));
    preencher('Modelo', 'Fiat Mobi');
    preencher('Placa', 'abc-1d23');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Veículo cadastrado.')).toBeTruthy();
    expect(screen.getByRole('listitem', { name: 'Fiat Mobi ABC1D23' })).toBeTruthy();
    expect(screen.queryByLabelText('Placa')).toBeNull();
    expect(corpoDa(fetch, 'POST', '/api/v1/veiculos')).toEqual({
      placa: 'ABC1D23',
      modelo: 'Fiat Mobi',
    });
  });

  it('recusa placa repetida e mantém o formulário aberto', async () => {
    simular((metodo, caminho) => {
      if (metodo === 'GET' && caminho === '/veiculos') return json(200, { veiculos: [argo] });
      if (metodo === 'POST' && caminho === '/veiculos') {
        return json(409, {
          erro: { codigo: 'PLACA_DUPLICADA', mensagem: 'Já existe um veículo com essa placa.' },
        });
      }
      return sessaoDoAdmin(metodo, caminho);
    });
    abrir('/admin/veiculos');
    await screen.findByRole('listitem', { name: 'Fiat Argo ABC1234' });

    fireEvent.click(screen.getByRole('button', { name: '+ Cadastrar veículo' }));
    preencher('Modelo', 'Outro Argo');
    preencher('Placa', 'ABC1234');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Já existe um veículo com essa placa.',
    );
    expect(screen.getByLabelText('Placa')).toBeTruthy();
  });

  it('valida a placa antes de enviar', async () => {
    const fetch = simular((metodo, caminho) => {
      if (metodo === 'GET' && caminho === '/veiculos') return json(200, { veiculos: [] });
      return sessaoDoAdmin(metodo, caminho);
    });
    abrir('/admin/veiculos');
    await screen.findByText('Nenhum veículo cadastrado.');

    fireEvent.click(screen.getByRole('button', { name: '+ Cadastrar veículo' }));
    preencher('Modelo', 'Fiat Mobi');
    preencher('Placa', '123');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Placa inválida');
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('edita o veículo sem perder a contagem de reservas futuras', async () => {
    const fetch = simular((metodo, caminho) => {
      if (metodo === 'GET' && caminho === '/veiculos') return json(200, { veiculos: [argo] });
      if (metodo === 'PUT' && caminho === '/veiculos/1') {
        // Editar não devolve a contagem.
        return json(200, {
          veiculo: { id: 1, placa: 'ABC1234', modelo: 'Fiat Argo Drive', ativo: true },
        });
      }
      return sessaoDoAdmin(metodo, caminho);
    });
    abrir('/admin/veiculos');
    const cartao = await screen.findByRole('listitem', { name: 'Fiat Argo ABC1234' });

    fireEvent.click(within(cartao).getByRole('button', { name: 'Editar' }));
    expect((screen.getByLabelText('Modelo') as HTMLInputElement).value).toBe('Fiat Argo');
    preencher('Modelo', 'Fiat Argo Drive');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Veículo atualizado.')).toBeTruthy();
    const editado = screen.getByRole('listitem', { name: 'Fiat Argo Drive ABC1234' });
    expect(editado.textContent).toContain('2 reservas futuras');
    expect(corpoDa(fetch, 'PUT', '/api/v1/veiculos/1')).toEqual({
      placa: 'ABC1234',
      modelo: 'Fiat Argo Drive',
    });
  });
});

describe('Veículos: desativar (RN10)', () => {
  const afetadas = [
    {
      id: 10,
      data: '2026-11-03',
      turno: 'MATUTINO',
      destino: 'Escola Alfa',
      usuario: { id: 5, nome: 'Bruno Costa' },
    },
    {
      id: 11,
      data: '2026-11-04',
      turno: 'VESPERTINO',
      destino: 'Creche Beta',
      usuario: { id: 6, nome: 'Carla Dias' },
    },
  ];

  function simularDesativacao(reservas = afetadas) {
    return simular((metodo, caminho) => {
      if (metodo === 'GET' && caminho === '/veiculos') return json(200, { veiculos: [argo] });
      if (metodo === 'GET' && caminho === '/veiculos/1/reservas-futuras') {
        return json(200, { reservas });
      }
      if (metodo === 'PATCH' && caminho === '/veiculos/1/situacao') {
        return json(200, {
          veiculo: { ...argo, ativo: false, reservasFuturas: 0 },
          reservasCanceladas: reservas,
        });
      }
      return sessaoDoAdmin(metodo, caminho);
    });
  }

  it('mostra as reservas que serão canceladas e só desativa depois de confirmar', async () => {
    const fetch = simularDesativacao();
    abrir('/admin/veiculos');
    const cartao = await screen.findByRole('listitem', { name: 'Fiat Argo ABC1234' });

    fireEvent.click(within(cartao).getByRole('button', { name: 'Desativar' }));

    const modal = await screen.findByRole('dialog', { name: /Desativar Fiat Argo/ });
    const lista = await within(modal).findByRole('list', {
      name: 'Reservas que serão canceladas',
    });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2);
    expect(lista.textContent).toContain(dataComSemana('2026-11-03'));
    expect(lista.textContent).toContain('Bruno Costa — Escola Alfa');
    expect(lista.textContent).toContain('Carla Dias — Creche Beta');
    expect(modal.textContent).toContain('As 2 reservas abaixo serão canceladas');
    // Até confirmar, nada foi enviado.
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);

    fireEvent.click(within(modal).getByRole('button', { name: 'Desativar e cancelar 2 reservas' }));

    expect(await screen.findByText('Veículo desativado. 2 reservas canceladas.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    const depois = screen.getByRole('listitem', { name: 'Fiat Argo ABC1234' });
    expect(depois.textContent).toContain('Desativado');
    expect(depois.textContent).toContain('0 reservas futuras');
    expect(corpoDa(fetch, 'PATCH', '/api/v1/veiculos/1/situacao')).toEqual({ ativo: false });
  });

  it('Voltar e Esc fecham sem desativar', async () => {
    const fetch = simularDesativacao();
    abrir('/admin/veiculos');
    const cartao = await screen.findByRole('listitem', { name: 'Fiat Argo ABC1234' });

    fireEvent.click(within(cartao).getByRole('button', { name: 'Desativar' }));
    const modal = await screen.findByRole('dialog');
    fireEvent.click(within(modal).getByRole('button', { name: 'Voltar' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(within(cartao).getByRole('button', { name: 'Desativar' }));
    await screen.findByRole('dialog');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(fetch.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
    expect(screen.getByRole('listitem', { name: 'Fiat Argo ABC1234' }).textContent).toContain(
      'Ativo',
    );
  });

  it('sem reservas futuras, avisa e desativa direto', async () => {
    simularDesativacao([]);
    abrir('/admin/veiculos');
    const cartao = await screen.findByRole('listitem', { name: 'Fiat Argo ABC1234' });

    fireEvent.click(within(cartao).getByRole('button', { name: 'Desativar' }));
    const modal = await screen.findByRole('dialog');
    expect(await within(modal).findByText(/não tem reservas futuras/)).toBeTruthy();

    fireEvent.click(within(modal).getByRole('button', { name: 'Desativar' }));
    expect(await screen.findByText('Veículo desativado.')).toBeTruthy();
  });

  it('não deixa confirmar enquanto a lista não carregou, e mostra o erro se ela falhar', async () => {
    simular((metodo, caminho) => {
      if (metodo === 'GET' && caminho === '/veiculos') return json(200, { veiculos: [argo] });
      if (metodo === 'GET' && caminho === '/veiculos/1/reservas-futuras') {
        return json(500, { erro: { codigo: 'ERRO_INTERNO', mensagem: 'Falha no servidor.' } });
      }
      return sessaoDoAdmin(metodo, caminho);
    });
    abrir('/admin/veiculos');
    const cartao = await screen.findByRole('listitem', { name: 'Fiat Argo ABC1234' });

    fireEvent.click(within(cartao).getByRole('button', { name: 'Desativar' }));
    const modal = await screen.findByRole('dialog');
    expect((await within(modal).findByRole('alert')).textContent).toBe('Falha no servidor.');
    expect(
      (within(modal).getByRole('button', { name: 'Desativar' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('reativa direto, sem confirmação', async () => {
    const fetch = simular((metodo, caminho) => {
      if (metodo === 'GET' && caminho === '/veiculos') return json(200, { veiculos: [onix] });
      if (metodo === 'PATCH' && caminho === '/veiculos/2/situacao') {
        return json(200, {
          veiculo: { ...onix, ativo: true },
          reservasCanceladas: [],
        });
      }
      return sessaoDoAdmin(metodo, caminho);
    });
    abrir('/admin/veiculos');
    const cartao = await screen.findByRole('listitem', { name: 'Onix XYZ9A87' });

    fireEvent.click(within(cartao).getByRole('button', { name: 'Reativar' }));

    expect(await screen.findByText('Veículo reativado.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('listitem', { name: 'Onix XYZ9A87' }).textContent).toContain('Ativo');
    expect(corpoDa(fetch, 'PATCH', '/api/v1/veiculos/2/situacao')).toEqual({ ativo: true });
  });
});
