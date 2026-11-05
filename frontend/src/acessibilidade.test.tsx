import type { UsuarioSessao } from '@gve/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Rotas } from './App';
import { ProvedorSessao } from './auth/sessao';
import { hojeEmSaoPaulo, inicioDaSemana } from './datas';
import { ProvedorToast } from './toast/ProvedorToast';

const ana: UsuarioSessao = {
  id: 1,
  nome: 'Ana Servidora',
  email: 'ana@gve.local',
  perfil: 'SERVIDOR',
  trocaSenhaObrigatoria: false,
};

function json(status: number, corpo?: unknown) {
  return Promise.resolve(
    new Response(corpo === undefined ? null : JSON.stringify(corpo), { status }),
  );
}

/** Simula a API. `responder` recebe o método e o caminho (com a query); sem resposta vira 404. */
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const inicio = inicioDaSemana(hojeEmSaoPaulo());
const veiculo = { id: 1, placa: 'AAA1A11', modelo: 'Fiat Argo' };
const reservaDeBruno = {
  id: 11,
  data: inicio,
  turno: 'VESPERTINO',
  destino: 'Escola Beta',
  veiculo,
  usuario: { id: 2, nome: 'Bruno Costa' },
};

/** Ana logada; agenda com um carro e uma reserva do Bruno; o resto responde vazio. */
function simularServidora() {
  return simular((_metodo, caminho) => {
    if (caminho === '/auth/me') return json(200, { usuario: ana });
    if (caminho === '/reservas/minhas') return json(200, { reservas: [] });
    if (caminho === '/reservas/datas-permitidas') return json(200, { datas: [] });
    if (caminho.startsWith('/agenda?')) {
      return json(200, { reservas: [reservaDeBruno], veiculos: [veiculo], feriados: [] });
    }
    return undefined;
  });
}

describe('Navegação por teclado', () => {
  it('o primeiro item do Tab pula o menu e leva ao conteúdo', async () => {
    simularServidora();
    abrir('/');
    const pular = await screen.findByRole('link', { name: 'Pular para o conteúdo' });

    // Vem antes de qualquer outro link ou botão da página.
    const focaveis = document.querySelectorAll('a[href], button');
    expect(focaveis[0]).toBe(pular);
    expect(pular.getAttribute('href')).toBe('#conteudo');
    expect(screen.getByRole('main').id).toBe('conteudo');
    // O conteúdo aceita foco por script (link e troca de tela), mas não entra na ordem do Tab.
    expect(screen.getByRole('main').getAttribute('tabindex')).toBe('-1');
  });

  it('ao trocar de tela pelo menu, o foco vai para o conteúdo', async () => {
    simularServidora();
    abrir('/');
    const menu = await screen.findByRole('navigation', { name: 'Menu' });

    fireEvent.click(within(menu).getByRole('link', { name: 'Agenda da frota' }));

    await screen.findByRole('table', { name: 'Agenda semanal' });
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });
});

describe('Título da aba', () => {
  it('cada tela tem o próprio título', async () => {
    simularServidora();
    abrir('/agenda');
    await screen.findByRole('table', { name: 'Agenda semanal' });
    expect(document.title).toBe('Agenda da frota · Gestão Veicular');

    const menu = screen.getByRole('navigation', { name: 'Menu' });
    fireEvent.click(within(menu).getByRole('link', { name: 'Minha conta' }));
    await waitFor(() => expect(document.title).toBe('Minha conta · Gestão Veicular'));
  });

  it('a tela de entrada também', async () => {
    simular((_metodo, caminho) =>
      caminho === '/auth/me'
        ? json(401, { erro: { codigo: 'NAO_AUTENTICADO', mensagem: '' } })
        : undefined,
    );
    abrir('/entrar');
    await screen.findByRole('button', { name: 'Entrar' });
    expect(document.title).toBe('Entrar · Gestão Veicular');
  });
});

describe('Agenda para leitor de tela', () => {
  it('é uma tabela: dias nas colunas, veículo e turno nas linhas', async () => {
    simularServidora();
    abrir('/agenda');
    const tabela = await screen.findByRole('table', { name: 'Agenda semanal' });

    // Uma coluna de rótulo e os 7 dias.
    expect(within(tabela).getAllByRole('columnheader')).toHaveLength(8);
    // Manhã e tarde do carro; a linha da tarde também diz qual é o carro.
    const linhas = within(tabela).getAllByRole('rowheader');
    expect(linhas).toHaveLength(2);
    expect(linhas[1]!.textContent).toContain('Fiat Argo');
    expect(linhas[1]!.textContent).toContain('Tarde');
  });

  it('a reserva diz quem, qual carro, quando e o destino, sem precisar abrir o detalhe', async () => {
    simularServidora();
    abrir('/agenda');
    const tabela = await screen.findByRole('table', { name: 'Agenda semanal' });

    const chip = within(tabela).getByRole('button', { name: /^Reserva de Bruno Costa/ });
    expect(chip.getAttribute('aria-label')).toContain('Fiat Argo');
    expect(chip.getAttribute('aria-label')).toContain('Tarde');
    expect(chip.getAttribute('aria-label')).toContain('Destino: Escola Beta');
    // Na tela continua só o primeiro nome.
    expect(chip.textContent).toBe('Bruno');
  });
});

describe('Nova reserva', () => {
  it('anuncia a etapa atual para o leitor de tela', async () => {
    simularServidora();
    abrir('/reservas/nova');
    const etapa = await screen.findByText('Etapa 1 de 3: data e turno');
    expect(etapa.getAttribute('aria-live')).toBe('polite');
  });
});
