import type { UsuarioSessao } from '@gve/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Rotas } from './App';
import { ProvedorSessao } from './auth/sessao';
import { anoAtual } from './datas';
import { ProvedorToast } from './toast/ProvedorToast';

const servidora: UsuarioSessao = {
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

const naoAutenticado = () =>
  json(401, { erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Sua sessão expirou.' } });

/** Simula a API: cada chave é "MÉTODO /caminho". */
function simularApi(rotas: Record<string, () => Promise<Response>>) {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const chave = `${init?.method ?? 'GET'} ${url.replace('/api/v1', '')}`;
    return rotas[chave]?.() ?? json(404, { erro: { codigo: 'NAO_ENCONTRADO', mensagem: '' } });
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('login', () => {
  it('sem sessão, manda para a tela de login com o logo', async () => {
    simularApi({ 'GET /auth/me': naoAutenticado });
    abrir('/');
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeTruthy();
    expect(screen.getByAltText('Prefeitura de Barão de Cocais')).toBeTruthy();
    expect(screen.queryByText(/sessão expirou/)).toBeNull();
  });

  it('login válido abre "Minhas reservas"', async () => {
    const fetch = simularApi({
      'GET /auth/me': naoAutenticado,
      'POST /auth/login': () => json(200, { usuario: servidora }),
    });
    abrir('/entrar');
    preencher('E-mail ou CPF', 'ana@gve.local');
    preencher('Senha', 'senha-boa-123');
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Minhas reservas' })).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/auth/login',
      expect.objectContaining({
        body: JSON.stringify({ login: 'ana@gve.local', senha: 'senha-boa-123' }),
      }),
    );
    expect(screen.queryByRole('link', { name: 'Usuários' })).toBeNull();
  });

  it('login inválido mostra o erro da API', async () => {
    simularApi({
      'GET /auth/me': naoAutenticado,
      'POST /auth/login': () =>
        json(401, {
          erro: { codigo: 'CREDENCIAIS_INVALIDAS', mensagem: 'E-mail/CPF ou senha incorretos.' },
        }),
    });
    abrir('/entrar');
    preencher('E-mail ou CPF', 'ana@gve.local');
    preencher('Senha', 'errada');
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }));
    expect((await screen.findByRole('alert')).textContent).toBe('E-mail/CPF ou senha incorretos.');
  });

  it('valida os campos antes de enviar', async () => {
    const fetch = simularApi({ 'GET /auth/me': naoAutenticado });
    abrir('/entrar');
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Informe o e-mail ou o CPF.');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('troca de senha obrigatória', () => {
  it('no 1º acesso pede nova senha e depois abre "Minhas reservas"', async () => {
    const fetch = simularApi({
      'GET /auth/me': () => json(200, { usuario: { ...servidora, trocaSenhaObrigatoria: true } }),
      'PUT /auth/senha': () => json(200, { usuario: servidora }),
      'GET /reservas/minhas': () => json(200, { reservas: [] }),
    });
    abrir('/');
    expect(await screen.findByRole('heading', { name: 'Crie sua senha' })).toBeTruthy();
    expect(screen.queryByLabelText('Senha atual')).toBeNull();

    preencher('Nova senha', 'nova-senha-456');
    preencher('Confirmar nova senha', 'nova-senha-456');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
    expect(await screen.findByRole('heading', { name: 'Minhas reservas' })).toBeTruthy();
    expect(screen.getByText('Senha criada. Boas-vindas!')).toBeTruthy();
    const chamada = fetch.mock.calls.find(([url, init]) => url === '/api/v1/auth/senha' && init);
    expect(JSON.parse(chamada![1]!.body as string)).toEqual({ novaSenha: 'nova-senha-456' });
  });

  it('recusa confirmação diferente', async () => {
    simularApi({
      'GET /auth/me': () => json(200, { usuario: { ...servidora, trocaSenhaObrigatoria: true } }),
    });
    abrir('/trocar-senha');
    await screen.findByRole('heading', { name: 'Crie sua senha' });
    preencher('Nova senha', 'nova-senha-456');
    preencher('Confirmar nova senha', 'outra-senha-789');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
    expect((await screen.findByRole('alert')).textContent).toBe('As senhas não conferem.');
  });
});

describe('rotas por perfil', () => {
  it('servidor não acessa a administração', async () => {
    simularApi({ 'GET /auth/me': () => json(200, { usuario: servidora }) });
    abrir('/admin/usuarios');
    expect(await screen.findByRole('heading', { name: 'Minhas reservas' })).toBeTruthy();
  });

  it('administrador acessa a administração', async () => {
    simularApi({
      'GET /auth/me': () => json(200, { usuario: { ...servidora, perfil: 'ADMINISTRADOR' } }),
    });
    abrir('/admin/usuarios');
    expect(await screen.findByRole('heading', { name: 'Usuários' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Veículos' }).length).toBeGreaterThan(0);
  });
});

describe('Minha conta', () => {
  it('mostra os dados do usuário e troca a senha pedindo a atual', async () => {
    const fetch = simularApi({
      'GET /auth/me': () => json(200, { usuario: servidora }),
      'PUT /auth/senha': () => json(200, { usuario: servidora }),
    });
    abrir('/conta');
    expect(await screen.findByText('ana@gve.local')).toBeTruthy();
    expect(screen.getAllByText('AS').length).toBeGreaterThan(0);

    preencher('Senha atual', 'senha-boa-123');
    preencher('Nova senha', 'nova-senha-456');
    preencher('Confirmar nova senha', 'nova-senha-456');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    expect(await screen.findByText('Senha alterada.')).toBeTruthy();
    expect(JSON.parse(fetch.mock.calls.at(-1)![1]!.body as string)).toEqual({
      senhaAtual: 'senha-boa-123',
      novaSenha: 'nova-senha-456',
    });
  });

  it('sai do sistema e volta ao login', async () => {
    const fetch = simularApi({
      'GET /auth/me': () => json(200, { usuario: servidora }),
      'POST /auth/logout': () => json(204),
    });
    abrir('/conta');
    fireEvent.click((await screen.findAllByRole('button', { name: 'Sair' }))[0]!);
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith('/api/v1/auth/logout', expect.anything());
  });

  it('avisa quando a sessão expira', async () => {
    simularApi({
      'GET /auth/me': () => json(200, { usuario: servidora }),
      'PUT /auth/senha': naoAutenticado,
    });
    abrir('/conta');
    await screen.findByRole('heading', { name: 'Minha conta' });
    preencher('Senha atual', 'senha-boa-123');
    preencher('Nova senha', 'nova-senha-456');
    preencher('Confirmar nova senha', 'nova-senha-456');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    expect(await screen.findByText('Sua sessão expirou. Entre novamente.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();
  });
});

describe('Feriados', () => {
  // Mesmo cálculo da tela: o ano corrente em São Paulo.
  const ANO = anoAtual();
  const admin = { ...servidora, perfil: 'ADMINISTRADOR' };
  const natal = {
    id: 1,
    data: `${ANO}-12-25`,
    descricao: 'Natal',
    abrangencia: 'NACIONAL',
    reservasAtivas: 0,
  };

  it('lista os feriados do ano e exclui com confirmação', async () => {
    vi.stubGlobal('confirm', () => true);
    const fetch = simularApi({
      'GET /auth/me': () => json(200, { usuario: admin }),
      [`GET /feriados?ano=${ANO}`]: () =>
        json(200, { feriados: [{ ...natal, reservasAtivas: 2 }] }),
      'DELETE /feriados/1': () => json(204),
    });
    abrir('/admin/feriados');

    const item = await screen.findByRole('listitem', { name: /Natal/ });
    expect(item.textContent).toContain('25/12');
    expect(item.textContent).toContain('2 reservas ativas');

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Feriado excluído.')).toBeTruthy();
    expect(screen.queryByRole('listitem', { name: /Natal/ })).toBeNull();
    expect(fetch).toHaveBeenCalledWith('/api/v1/feriados/1', expect.anything());
  });

  it('cadastra e avisa quando a data já tem reservas (RN11)', async () => {
    const fetch = simularApi({
      'GET /auth/me': () => json(200, { usuario: admin }),
      [`GET /feriados?ano=${ANO}`]: () => json(200, { feriados: [] }),
      'POST /feriados': () =>
        json(201, {
          feriado: {
            id: 2,
            data: `${ANO}-07-16`,
            descricao: 'Aniversário da cidade',
            abrangencia: 'MUNICIPAL',
            reservasAtivas: 3,
          },
        }),
    });
    abrir('/admin/feriados');
    await screen.findByText(/Nenhum feriado cadastrado/);

    preencher('Data', `${ANO}-07-16`);
    preencher('Nome do feriado', 'Aniversário da cidade');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByText('Feriado cadastrado.')).toBeTruthy();
    expect(screen.getByRole('listitem', { name: /Aniversário da cidade/ })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(
      /Já existem reservas ativas em .*16\/07\/\d{4} \(3 reservas\)/,
    );
    expect(JSON.parse(fetch.mock.calls.at(-1)![1]!.body as string)).toEqual({
      data: `${ANO}-07-16`,
      descricao: 'Aniversário da cidade',
      abrangencia: 'MUNICIPAL',
    });
  });

  it('valida o formulário antes de enviar', async () => {
    const fetch = simularApi({
      'GET /auth/me': () => json(200, { usuario: admin }),
      [`GET /feriados?ano=${ANO}`]: () => json(200, { feriados: [] }),
    });
    abrir('/admin/feriados');
    await screen.findByText(/Nenhum feriado cadastrado/);

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Informe a data.');
    expect(fetch).not.toHaveBeenCalledWith('/api/v1/feriados', expect.anything());
  });

  it('importação que termina depois da troca de ano não mistura as listas', async () => {
    let responderImportacao!: (resposta: Response) => void;
    simularApi({
      'GET /auth/me': () => json(200, { usuario: admin }),
      [`GET /feriados?ano=${ANO}`]: () => json(200, { feriados: [] }),
      [`GET /feriados?ano=${ANO + 1}`]: () => json(200, { feriados: [] }),
      'POST /feriados/importar': () => new Promise((resolver) => (responderImportacao = resolver)),
    });
    abrir('/admin/feriados');
    await screen.findByText(/Nenhum feriado cadastrado/);

    // Importa o ano atual e, antes da resposta, vai para o próximo ano.
    fireEvent.click(screen.getByRole('button', { name: 'Importar feriados nacionais' }));
    fireEvent.click(screen.getByRole('button', { name: 'Próximo ano' }));
    await screen.findByText(`Nenhum feriado cadastrado em ${ANO + 1}.`, { exact: false });

    responderImportacao(new Response(JSON.stringify({ importados: [natal], ignorados: 0 })));
    expect(await screen.findByText(`1 feriado nacional importado em ${ANO}.`)).toBeTruthy();
    expect(screen.queryByRole('listitem', { name: /Natal/ })).toBeNull();
  });

  it('importa os feriados nacionais do ano exibido', async () => {
    const fetch = simularApi({
      'GET /auth/me': () => json(200, { usuario: admin }),
      [`GET /feriados?ano=${ANO}`]: () => json(200, { feriados: [] }),
      'POST /feriados/importar': () => json(200, { importados: [natal], ignorados: 1 }),
    });
    abrir('/admin/feriados');
    await screen.findByText(/Nenhum feriado cadastrado/);

    fireEvent.click(screen.getByRole('button', { name: 'Importar feriados nacionais' }));
    expect(await screen.findByText(`1 feriado nacional importado em ${ANO}.`)).toBeTruthy();
    expect(screen.getByRole('listitem', { name: /Natal/ })).toBeTruthy();
    expect(JSON.parse(fetch.mock.calls.at(-1)![1]!.body as string)).toEqual({ ano: ANO });
  });

  it('mostra a mensagem quando a BrasilAPI falha', async () => {
    simularApi({
      'GET /auth/me': () => json(200, { usuario: admin }),
      [`GET /feriados?ano=${ANO}`]: () => json(200, { feriados: [] }),
      'POST /feriados/importar': () =>
        json(502, {
          erro: { codigo: 'BRASILAPI_INDISPONIVEL', mensagem: 'BrasilAPI fora do ar.' },
        }),
    });
    abrir('/admin/feriados');
    await screen.findByText(/Nenhum feriado cadastrado/);

    fireEvent.click(screen.getByRole('button', { name: 'Importar feriados nacionais' }));
    expect(await screen.findByText('BrasilAPI fora do ar.')).toBeTruthy();
  });

  it('navega entre os anos', async () => {
    simularApi({
      'GET /auth/me': () => json(200, { usuario: admin }),
      [`GET /feriados?ano=${ANO}`]: () => json(200, { feriados: [natal] }),
      [`GET /feriados?ano=${ANO + 1}`]: () => json(200, { feriados: [] }),
    });
    abrir('/admin/feriados');
    await screen.findByRole('listitem', { name: /Natal/ });

    fireEvent.click(screen.getByRole('button', { name: 'Próximo ano' }));
    expect(await screen.findByRole('heading', { name: `Feriados de ${ANO + 1}` })).toBeTruthy();
    expect(
      await screen.findByText(`Nenhum feriado cadastrado em ${ANO + 1}.`, { exact: false }),
    ).toBeTruthy();
    expect(screen.queryByRole('listitem', { name: /Natal/ })).toBeNull();
  });
});
