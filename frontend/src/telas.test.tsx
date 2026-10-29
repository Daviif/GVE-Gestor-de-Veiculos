import { ANTECEDENCIA_MIN, type UsuarioSessao } from '@gve/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Rotas } from './App';
import { ProvedorSessao } from './auth/sessao';
import { diaComSemana, hojeEmSaoPaulo, inicioDaSemana, somarDias } from './datas';
import { ProvedorToast } from './toast/ProvedorToast';

const ana: UsuarioSessao = {
  id: 1,
  nome: 'Ana Servidora',
  email: 'ana@gve.local',
  perfil: 'SERVIDOR',
  trocaSenhaObrigatoria: false,
};
const admin: UsuarioSessao = { ...ana, nome: 'Administrador', perfil: 'ADMINISTRADOR' };

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

describe('Agenda da frota', () => {
  const hoje = hojeEmSaoPaulo();
  const inicio = inicioDaSemana(hoje);
  const veiculo = { id: 1, placa: 'AAA1A11', modelo: 'Fiat Argo' };
  const reservaDeAna = {
    id: 10,
    data: inicio,
    turno: 'MATUTINO',
    destino: 'Escola Alfa',
    veiculo,
    usuario: { id: 1, nome: 'Ana Servidora' },
  };
  const reservaDeBruno = {
    id: 11,
    data: inicio,
    turno: 'VESPERTINO',
    destino: 'Escola Beta',
    veiculo,
    usuario: { id: 2, nome: 'Bruno Costa' },
  };

  /** Responde a agenda de qualquer semana, devolvendo só as reservas que caem nela. */
  function agendaDeQualquerSemana(caminho: string) {
    const busca = new URL(caminho, 'http://gve.local').searchParams;
    const de = busca.get('inicio')!;
    const ate = busca.get('fim')!;
    const reservas = [reservaDeAna, reservaDeBruno].filter((r) => r.data >= de && r.data <= ate);
    return json(200, { reservas, veiculos: [veiculo], feriados: [] });
  }

  function simularAgenda() {
    return simular((_metodo, caminho) => {
      if (caminho === '/auth/me') return json(200, { usuario: ana });
      if (caminho.startsWith('/agenda?')) return agendaDeQualquerSemana(caminho);
      return undefined;
    });
  }

  it('desenha a grade por veículo e turno e destaca as reservas do próprio usuário', async () => {
    simularAgenda();
    abrir('/agenda');

    expect(await screen.findByRole('grid', { name: 'Agenda semanal' })).toBeTruthy();
    expect(screen.getAllByText('Fiat Argo').length).toBeGreaterThan(0);

    const minha = await screen.findByRole('button', { name: 'Ana' });
    const dele = screen.getByRole('button', { name: 'Bruno' });
    expect(minha.className).toContain('minha');
    expect(dele.className).not.toContain('minha');
  });

  it('abre o destino ao clicar na reserva de outro servidor e fecha com Esc', async () => {
    simularAgenda();
    abrir('/agenda');

    fireEvent.click(await screen.findByRole('button', { name: 'Bruno' }));
    const detalhe = await screen.findByRole('dialog', { name: /Bruno Costa/ });
    expect(detalhe.textContent).toContain('Destino: Escola Beta');
    expect(detalhe.textContent).toContain('Fiat Argo · AAA1A11');

    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('mantém o detalhe aberto quando a grade rola (o navegador rola sozinho ao clicar no chip)', async () => {
    simularAgenda();
    abrir('/agenda');

    fireEvent.click(await screen.findByRole('button', { name: 'Bruno' }));
    await screen.findByRole('dialog', { name: /Bruno Costa/ });

    // Em telas estreitas a grade rola na horizontal logo depois do clique; isso não pode fechar.
    fireEvent.scroll(window);
    fireEvent.scroll(document.body);
    fireEvent.resize(window);
    expect(screen.getByRole('dialog', { name: /Bruno Costa/ })).toBeTruthy();
  });

  it('"+ reservar" leva à nova reserva já no passo 2, com data, turno e veículo', async () => {
    const alvo = somarDias(hoje, ANTECEDENCIA_MIN);
    const fetch = simular((_metodo, caminho) => {
      if (caminho === '/auth/me') return json(200, { usuario: ana });
      if (caminho.startsWith('/agenda?')) return agendaDeQualquerSemana(caminho);
      if (caminho === '/reservas/datas-permitidas') return json(200, { datas: [alvo] });
      if (caminho === `/reservas/disponibilidade?data=${alvo}&turno=MATUTINO`) {
        return json(200, { veiculos: [{ ...veiculo, ocupado: false }] });
      }
      return undefined;
    });
    abrir('/agenda');
    await screen.findByRole('grid', { name: 'Agenda semanal' });

    // O primeiro dia reservável (D+5) pode cair na semana seguinte.
    if (inicioDaSemana(alvo) !== inicio) {
      fireEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
    }
    const livre = await screen.findByRole('button', {
      name: `Reservar Fiat Argo AAA1A11, ${diaComSemana(alvo)}, Manhã`,
    });
    fireEvent.click(livre);

    expect(await screen.findByText('Escolha o veículo')).toBeTruthy();
    const opcao = await screen.findByRole('radio', { name: /Fiat Argo/ });
    expect(opcao.getAttribute('aria-checked')).toBe('true');
    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/reservas/disponibilidade?data=${alvo}&turno=MATUTINO`,
      expect.anything(),
    );
  });

  it('oferece "+ reservar" só nos 3 dias de D+5 a D+7 (2 turnos cada), somando as duas semanas', async () => {
    simularAgenda();
    abrir('/agenda');
    await screen.findByRole('grid', { name: 'Agenda semanal' });

    const livres = () => screen.queryAllByRole('button', { name: /^Reservar Fiat Argo/ }).length;
    const naSemanaAtual = livres();

    fireEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
    await screen.findByRole('grid', { name: 'Agenda semanal' });
    const naSemanaSeguinte = livres();

    // D+5 a D+7 cabem sempre nessas duas semanas: 3 dias × manhã e tarde, com 1 veículo.
    expect(naSemanaAtual + naSemanaSeguinte).toBe(6);
  });

  it('mostra o erro sem ficar preso em "Carregando…" e tenta de novo', async () => {
    let chamadas = 0;
    simular((_metodo, caminho) => {
      if (caminho === '/auth/me') return json(200, { usuario: ana });
      if (caminho.startsWith('/agenda?')) {
        chamadas += 1;
        return chamadas === 1
          ? json(500, { erro: { codigo: 'ERRO_INTERNO', mensagem: 'Falha no servidor.' } })
          : agendaDeQualquerSemana(caminho);
      }
      return undefined;
    });
    abrir('/agenda');

    expect((await screen.findByRole('alert')).textContent).toBe('Falha no servidor.');
    expect(screen.queryByText('Carregando…')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('grid', { name: 'Agenda semanal' })).toBeTruthy();
  });
});

describe('Minhas reservas', () => {
  const hoje = hojeEmSaoPaulo();
  const veiculo = { id: 1, placa: 'AAA1A11', modelo: 'Fiat Argo' };
  const futura = {
    id: 1,
    data: somarDias(hoje, 6),
    turno: 'MATUTINO',
    destino: 'Escola Alfa',
    status: 'ATIVA',
    veiculo,
  };
  const passada = {
    id: 2,
    data: somarDias(hoje, -3),
    turno: 'VESPERTINO',
    destino: 'Escola Beta',
    status: 'ATIVA',
    veiculo,
  };

  it('separa próximas e anteriores, e cancela com confirmação', async () => {
    vi.stubGlobal('confirm', () => true);
    const fetch = simular((metodo, caminho) => {
      if (caminho === '/auth/me') return json(200, { usuario: ana });
      if (caminho === '/reservas/minhas') return json(200, { reservas: [futura, passada] });
      if (metodo === 'POST' && caminho === '/reservas/1/cancelar') {
        return json(200, { reserva: { ...futura, status: 'CANCELADA' } });
      }
      return undefined;
    });
    abrir('/');

    const proxima = await screen.findByRole('listitem', { name: /Escola Alfa/ });
    expect(proxima.textContent).toContain('Manhã');
    expect(proxima.textContent).toContain('Fiat Argo · AAA1A11');
    // A anterior aparece só para leitura, como concluída.
    expect(screen.getByText('Concluída')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByText('Reserva cancelada.')).toBeTruthy();
    expect(screen.queryByRole('listitem', { name: /Escola Alfa/ })).toBeNull();
    expect(screen.getByText('Cancelada')).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/reservas/1/cancelar',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('avisa quando não há reservas futuras', async () => {
    simular((_metodo, caminho) => {
      if (caminho === '/auth/me') return json(200, { usuario: ana });
      if (caminho === '/reservas/minhas') return json(200, { reservas: [] });
      return undefined;
    });
    abrir('/');
    expect(await screen.findByText('Você não tem reservas futuras.')).toBeTruthy();
  });
});

describe('Usuários (administração)', () => {
  const carlos = {
    id: 2,
    nome: 'Carlos Servidor',
    email: 'carlos@gve.local',
    cpf: '52998224725',
    perfil: 'SERVIDOR',
    ativo: true,
    trocaSenhaObrigatoria: false,
  };
  const diana = {
    ...carlos,
    id: 3,
    nome: 'Diana Desativada',
    email: 'diana@gve.local',
    cpf: '11144477735',
    ativo: false,
  };

  function preencher(rotulo: string, valor: string) {
    fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
  }

  it('lista com CPF mascarado, situação em pílula e busca', async () => {
    simular((_metodo, caminho) => {
      if (caminho === '/auth/me') return json(200, { usuario: admin });
      if (caminho === '/usuarios') return json(200, { usuarios: [carlos, diana] });
      return undefined;
    });
    abrir('/admin/usuarios');

    const linha = await screen.findByLabelText('Carlos Servidor');
    expect(linha.textContent).toContain('529.982.247-25');
    expect(linha.textContent).toContain('Ativo');
    expect(screen.getByLabelText('Diana Desativada').textContent).toContain('Inativo');

    preencher('Buscar usuário', 'diana');
    expect(screen.queryByLabelText('Carlos Servidor')).toBeNull();
    expect(screen.getByLabelText('Diana Desativada')).toBeTruthy();

    // A busca também aceita o CPF, com ou sem máscara.
    preencher('Buscar usuário', '529.982');
    expect(screen.getByLabelText('Carlos Servidor')).toBeTruthy();
  });

  it('abre o formulário no topo, cadastra e mostra a senha provisória', async () => {
    const fetch = simular((metodo, caminho) => {
      if (caminho === '/auth/me') return json(200, { usuario: admin });
      if (metodo === 'GET' && caminho === '/usuarios') return json(200, { usuarios: [] });
      if (metodo === 'POST' && caminho === '/usuarios') {
        return json(201, { usuario: carlos, senhaProvisoria: 'Abc123xyz9' });
      }
      return undefined;
    });
    abrir('/admin/usuarios');
    await screen.findByText('Nenhum usuário cadastrado.');
    expect(screen.queryByLabelText('CPF')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '+ Cadastrar usuário' }));
    preencher('Nome', 'Carlos Servidor');
    preencher('E-mail', 'carlos@gve.local');
    preencher('CPF', '529.982.247-25');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Abc123xyz9')).toBeTruthy();
    expect(screen.getByText('Usuário cadastrado.')).toBeTruthy();
    expect(screen.getByLabelText('Carlos Servidor')).toBeTruthy();
    // O formulário fecha depois de salvar.
    expect(screen.queryByLabelText('CPF')).toBeNull();
    const corpo = JSON.parse(
      fetch.mock.calls.find(
        ([url, init]) => url === '/api/v1/usuarios' && init?.method === 'POST',
      )![1]!.body as string,
    );
    expect(corpo).toEqual({
      nome: 'Carlos Servidor',
      email: 'carlos@gve.local',
      cpf: '52998224725',
      perfil: 'SERVIDOR',
    });
  });

  it('recusa CPF inválido antes de enviar', async () => {
    const fetch = simular((_metodo, caminho) => {
      if (caminho === '/auth/me') return json(200, { usuario: admin });
      if (caminho === '/usuarios') return json(200, { usuarios: [] });
      return undefined;
    });
    abrir('/admin/usuarios');
    await screen.findByText('Nenhum usuário cadastrado.');

    fireEvent.click(screen.getByRole('button', { name: '+ Cadastrar usuário' }));
    preencher('Nome', 'Carlos Servidor');
    preencher('E-mail', 'carlos@gve.local');
    preencher('CPF', '111.111.111-11');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect((await screen.findByRole('alert')).textContent).toContain('CPF inválido');
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('redefine a senha com confirmação e mostra a nova senha provisória', async () => {
    vi.stubGlobal('confirm', () => true);
    simular((metodo, caminho) => {
      if (caminho === '/auth/me') return json(200, { usuario: admin });
      if (caminho === '/usuarios') return json(200, { usuarios: [carlos] });
      if (metodo === 'POST' && caminho === '/usuarios/2/redefinir-senha') {
        return json(200, { senhaProvisoria: 'Nova9876abc' });
      }
      return undefined;
    });
    abrir('/admin/usuarios');
    await screen.findByLabelText('Carlos Servidor');

    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));
    expect(await screen.findByText('Nova9876abc')).toBeTruthy();
  });
});
