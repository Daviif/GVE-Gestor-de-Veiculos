import type { UsuarioSessao } from '@gve/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Rotas } from './App';
import { ProvedorSessao } from './auth/sessao';
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
