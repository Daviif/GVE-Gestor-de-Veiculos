import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import { prisma } from '../src/db';
import { falhasPorIp, MAX_FALHAS_POR_IP } from '../src/routes/auth';
import { autenticar, exigirPerfil } from '../src/middleware/autenticacao';
import { tratarErros } from '../src/middleware/erros';
import { gerarHashSenha } from '../src/seguranca/senha';
import { travarConta } from '../src/seguranca/sessao';

const app = criarApp();

// App mínimo para testar os middlewares em rotas que ainda não existem na API.
const appProtegido = express();
appProtegido.get('/api/servidor', autenticar(), (_req, res) => {
  res.json({ ok: true });
});
appProtegido.get('/api/admin', autenticar(), exigirPerfil('ADMINISTRADOR'), (_req, res) => {
  res.json({ ok: true });
});
appProtegido.use(tratarErros);

const SENHA = 'senha-boa-123';

async function criarUsuario(dados: {
  email?: string;
  cpf?: string;
  perfil?: 'ADMINISTRADOR' | 'SERVIDOR';
  ativo?: boolean;
  trocaSenhaObrigatoria?: boolean;
}) {
  return prisma.usuario.create({
    data: {
      nome: 'Ana Servidora',
      email: dados.email ?? 'ana@gve.local',
      cpf: dados.cpf ?? '52998224725',
      senhaHash: await gerarHashSenha(SENHA),
      perfil: dados.perfil ?? 'SERVIDOR',
      ativo: dados.ativo ?? true,
      trocaSenhaObrigatoria: dados.trocaSenhaObrigatoria ?? false,
    },
  });
}

async function entrar(login = 'ana@gve.local', senha = SENHA) {
  const agente = request.agent(app);
  const resposta = await agente.post('/api/v1/auth/login').send({ login, senha });
  return { agente, resposta };
}

function cookieSessao(resposta: request.Response): string {
  const cookies = resposta.headers['set-cookie'] as unknown as string[];
  const cookie = cookies.find((c) => c.startsWith('gve_sessao='));
  if (!cookie) throw new Error('sem cookie de sessão');
  return cookie;
}

beforeEach(async () => {
  await falhasPorIp.resetAll();
  await prisma.sessao.deleteMany();
  await prisma.logAuditoria.deleteMany();
  await prisma.reserva.deleteMany();
  await prisma.feriado.deleteMany();
  await prisma.usuario.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /auth/login', () => {
  it('entra com e-mail e devolve cookie HttpOnly', async () => {
    await criarUsuario({});
    const { resposta } = await entrar('ANA@gve.local');

    expect(resposta.status).toBe(200);
    expect(resposta.body.usuario).toMatchObject({ email: 'ana@gve.local', perfil: 'SERVIDOR' });
    expect(resposta.body.usuario.senhaHash).toBeUndefined();
    const cookie = cookieSessao(resposta);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Max-Age=1800');
  });

  it('entra com CPF, com ou sem máscara', async () => {
    await criarUsuario({});
    expect((await entrar('529.982.247-25')).resposta.status).toBe(200);
    expect((await entrar('52998224725')).resposta.status).toBe(200);
  });

  it('registra o login no log de auditoria', async () => {
    const usuario = await criarUsuario({});
    await entrar();
    const log = await prisma.logAuditoria.findMany({ where: { usuarioId: usuario.id } });
    expect(log.map((l) => l.acao)).toEqual(['LOGIN']);
  });

  it('recusa senha errada com mensagem genérica', async () => {
    await criarUsuario({});
    const { resposta } = await entrar('ana@gve.local', 'errada');
    expect(resposta.status).toBe(401);
    expect(resposta.body.erro).toEqual({
      codigo: 'CREDENCIAIS_INVALIDAS',
      mensagem: 'E-mail/CPF ou senha incorretos.',
    });
    expect(resposta.headers['set-cookie']).toBeUndefined();
  });

  it('recusa login inexistente com a mesma mensagem', async () => {
    const { resposta } = await entrar('ninguem@gve.local');
    expect(resposta.status).toBe(401);
    expect(resposta.body.erro.codigo).toBe('CREDENCIAIS_INVALIDAS');
    const falha = await prisma.logAuditoria.findFirstOrThrow({ where: { acao: 'LOGIN_FALHA' } });
    expect(falha.detalhes).toEqual({ motivo: 'CREDENCIAIS', login: 'ninguem@gve.local' });
  });

  it('recusa usuário desativado', async () => {
    await criarUsuario({ ativo: false });
    const { resposta } = await entrar();
    expect(resposta.status).toBe(403);
    expect(resposta.body.erro.codigo).toBe('USUARIO_DESATIVADO');
    expect(await prisma.sessao.count()).toBe(0);
  });

  it('não revela que a conta está desativada para quem erra a senha', async () => {
    await criarUsuario({ ativo: false });
    const { resposta } = await entrar('ana@gve.local', 'errada');
    expect(resposta.status).toBe(401);
  });

  it('valida a entrada', async () => {
    const { resposta } = await entrar('', '');
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.mensagem).toBe('Informe o e-mail ou o CPF.');
  });

  it('recusa login gigante sem gravá-lo no log de auditoria', async () => {
    const { resposta } = await entrar(`${'a'.repeat(90_000)}@gve.local`, 'errada');
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.mensagem).toBe('E-mail ou CPF longo demais.');
    expect(await prisma.logAuditoria.count()).toBe(0);
  });
});

describe('bloqueio após 5 tentativas em 15 min', () => {
  it('bloqueia a conta, mesmo com a senha certa, por e-mail ou CPF', async () => {
    await criarUsuario({});
    for (let i = 0; i < 5; i++) {
      expect((await entrar('ana@gve.local', 'errada')).resposta.status).toBe(401);
    }
    const { resposta } = await entrar('52998224725', SENHA);
    expect(resposta.status).toBe(429);
    expect(resposta.body.erro.codigo).toBe('LOGIN_BLOQUEADO');
    expect(resposta.body.erro.mensagem).toMatch(/Tente novamente em 15 min/);
  });

  it('não deixa tentativas em paralelo passarem do limite', async () => {
    await criarUsuario({});
    const respostas = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post('/api/v1/auth/login').send({ login: 'ana@gve.local', senha: 'errada' }),
      ),
    );
    const status = respostas.map((r) => r.status).sort();
    expect(status).toEqual([401, 401, 401, 401, 401, 429, 429, 429, 429, 429]);
  });

  it('login com a senha antiga não sobrevive a uma redefinição em andamento', async () => {
    const usuario = await criarUsuario({});
    let tentativa!: Promise<{ resposta: request.Response }>;
    // Faz o papel da redefinição: trava a conta, e o login fica na fila até o commit.
    await prisma.$transaction(async (tx) => {
      await travarConta(tx, usuario.id);
      tentativa = entrar('ana@gve.local', SENHA);
      await new Promise((resolver) => setTimeout(resolver, 300));
      await tx.usuario.update({
        where: { id: usuario.id },
        data: { senhaHash: await gerarHashSenha('senha-nova-456'), trocaSenhaObrigatoria: true },
      });
      await tx.sessao.deleteMany({ where: { usuarioId: usuario.id } });
    });

    const { resposta } = await tentativa;
    expect(resposta.status).toBe(401);
    expect(await prisma.sessao.count({ where: { usuarioId: usuario.id } })).toBe(0);
  });

  it('libera quando as falhas saem da janela de 15 min', async () => {
    const usuario = await criarUsuario({});
    for (let i = 0; i < 5; i++) await entrar('ana@gve.local', 'errada');
    await prisma.logAuditoria.updateMany({
      where: { usuarioId: usuario.id },
      data: { criadoEm: new Date(Date.now() - 16 * 60 * 1000) },
    });
    expect((await entrar()).resposta.status).toBe(200);
  });

  it('um login certo zera a contagem', async () => {
    await criarUsuario({});
    for (let i = 0; i < 4; i++) await entrar('ana@gve.local', 'errada');
    expect((await entrar()).resposta.status).toBe(200);
    for (let i = 0; i < 4; i++) await entrar('ana@gve.local', 'errada');
    expect((await entrar()).resposta.status).toBe(200);
  });

  it('também bloqueia login inexistente, sem afetar os outros', async () => {
    await criarUsuario({});
    for (let i = 0; i < 5; i++) await entrar('ninguem@gve.local', 'x');
    expect((await entrar('ninguem@gve.local', 'x')).resposta.status).toBe(429);
    expect((await entrar()).resposta.status).toBe(200);
  });
});

describe('limite de falhas por IP', () => {
  it('barra o IP depois de 20 falhas, mesmo espalhadas por contas diferentes', async () => {
    await criarUsuario({});
    for (let i = 0; i < MAX_FALHAS_POR_IP; i++) {
      const { resposta } = await entrar(`ninguem${i}@gve.local`, 'errada');
      expect(resposta.status).toBe(401);
    }

    // Nem a senha certa passa enquanto o IP está barrado.
    const { resposta } = await entrar('ana@gve.local', SENHA);
    expect(resposta.status).toBe(429);
    expect(resposta.body.erro.codigo).toBe('MUITAS_TENTATIVAS');
    expect(resposta.headers['retry-after']).toBeDefined();
  });

  it('logins certos não contam, para não barrar quem divide o mesmo IP', async () => {
    await criarUsuario({});
    for (let i = 0; i < MAX_FALHAS_POR_IP + 5; i++) {
      const { resposta } = await entrar();
      expect(resposta.status).toBe(200);
    }
  });
});

describe('sessão', () => {
  it('GET /auth/me devolve o usuário logado', async () => {
    await criarUsuario({});
    const { agente } = await entrar();
    const resposta = await agente.get('/api/v1/auth/me');
    expect(resposta.status).toBe(200);
    expect(resposta.body.usuario.email).toBe('ana@gve.local');
  });

  it('sem cookie responde 401', async () => {
    const resposta = await request(app).get('/api/v1/auth/me');
    expect(resposta.status).toBe(401);
    expect(resposta.body.erro.codigo).toBe('NAO_AUTENTICADO');
  });

  it('expira após 30 min sem uso', async () => {
    await criarUsuario({});
    const { agente } = await entrar();
    await prisma.sessao.updateMany({ data: { expiraEm: new Date(Date.now() - 1000) } });

    const resposta = await agente.get('/api/v1/auth/me');
    expect(resposta.status).toBe(401);
    expect(await prisma.sessao.count()).toBe(0);
  });

  it('cada uso renova o prazo para mais 30 min', async () => {
    await criarUsuario({});
    const { agente } = await entrar();
    await prisma.sessao.updateMany({ data: { expiraEm: new Date(Date.now() + 5 * 60 * 1000) } });

    await agente.get('/api/v1/auth/me');
    const sessao = await prisma.sessao.findFirstOrThrow();
    expect(sessao.expiraEm.getTime() - Date.now()).toBeGreaterThan(29 * 60 * 1000);
  });

  it('cai quando o usuário é desativado', async () => {
    const usuario = await criarUsuario({});
    const { agente } = await entrar();
    await prisma.usuario.update({ where: { id: usuario.id }, data: { ativo: false } });
    expect((await agente.get('/api/v1/auth/me')).status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('encerra a sessão, apaga o cookie e registra no log', async () => {
    const usuario = await criarUsuario({});
    const { agente } = await entrar();

    const resposta = await agente.post('/api/v1/auth/logout');
    expect(resposta.status).toBe(204);
    expect(cookieSessao(resposta)).toContain('Expires=Thu, 01 Jan 1970');
    expect(await prisma.sessao.count()).toBe(0);
    expect((await agente.get('/api/v1/auth/me')).status).toBe(401);
    const acoes = await prisma.logAuditoria.findMany({ where: { usuarioId: usuario.id } });
    expect(acoes.map((l) => l.acao)).toEqual(['LOGIN', 'LOGOUT']);
  });

  it('funciona mesmo sem sessão', async () => {
    expect((await request(app).post('/api/v1/auth/logout')).status).toBe(204);
  });
});

describe('PUT /auth/senha', () => {
  it('troca a senha, desliga a troca obrigatória e encerra as outras sessões', async () => {
    const usuario = await criarUsuario({ trocaSenhaObrigatoria: true });
    const { agente } = await entrar();
    await entrar(); // outra sessão, em outro navegador

    const resposta = await agente
      .put('/api/v1/auth/senha')
      .send({ senhaAtual: SENHA, novaSenha: 'nova-senha-456' });
    expect(resposta.status).toBe(200);
    expect(resposta.body.usuario.trocaSenhaObrigatoria).toBe(false);
    expect(await prisma.sessao.count()).toBe(1);
    expect((await agente.get('/api/v1/auth/me')).status).toBe(200);

    expect((await entrar('ana@gve.local', SENHA)).resposta.status).toBe(401);
    expect((await entrar('ana@gve.local', 'nova-senha-456')).resposta.status).toBe(200);
    const log = await prisma.logAuditoria.findFirst({
      where: { usuarioId: usuario.id, acao: 'SENHA_ALTERADA' },
    });
    expect(log).not.toBeNull();
  });

  it('no primeiro acesso dispensa a senha atual, mas não aceita repetir a temporária', async () => {
    await criarUsuario({ trocaSenhaObrigatoria: true });
    const { agente } = await entrar();

    const repetida = await agente.put('/api/v1/auth/senha').send({ novaSenha: SENHA });
    expect(repetida.status).toBe(400);
    expect(repetida.body.erro.codigo).toBe('SENHA_REPETIDA');

    const resposta = await agente.put('/api/v1/auth/senha').send({ novaSenha: 'nova-senha-456' });
    expect(resposta.status).toBe(200);
    expect(resposta.body.usuario.trocaSenhaObrigatoria).toBe(false);
  });

  it('fora do primeiro acesso exige a senha atual', async () => {
    await criarUsuario({});
    const { agente } = await entrar();
    const resposta = await agente.put('/api/v1/auth/senha').send({ novaSenha: 'nova-senha-456' });
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.mensagem).toBe('Informe a senha atual.');
  });

  it('recusa senha atual incorreta', async () => {
    await criarUsuario({});
    const { agente } = await entrar();
    const resposta = await agente
      .put('/api/v1/auth/senha')
      .send({ senhaAtual: 'errada', novaSenha: 'nova-senha-456' });
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('SENHA_ATUAL_INCORRETA');
  });

  it('exige sessão', async () => {
    const resposta = await request(app)
      .put('/api/v1/auth/senha')
      .send({ senhaAtual: SENHA, novaSenha: 'nova-senha-456' });
    expect(resposta.status).toBe(401);
  });
});

describe('rotas protegidas', () => {
  async function cookieDe(email: string) {
    return cookieSessao((await entrar(email)).resposta).split(';')[0]!;
  }

  it('bloqueia as demais rotas enquanto a troca de senha estiver pendente', async () => {
    await criarUsuario({ trocaSenhaObrigatoria: true });
    const resposta = await request(appProtegido)
      .get('/api/servidor')
      .set('Cookie', await cookieDe('ana@gve.local'));
    expect(resposta.status).toBe(403);
    expect(resposta.body.erro.codigo).toBe('TROCA_SENHA_OBRIGATORIA');
  });

  it('libera rota de administração só para o administrador', async () => {
    await criarUsuario({});
    await criarUsuario({ email: 'admin@gve.local', cpf: '11144477735', perfil: 'ADMINISTRADOR' });
    const servidor = await cookieDe('ana@gve.local');
    const admin = await cookieDe('admin@gve.local');

    expect((await request(appProtegido).get('/api/servidor').set('Cookie', servidor)).status).toBe(
      200,
    );
    const negado = await request(appProtegido).get('/api/admin').set('Cookie', servidor);
    expect(negado.status).toBe(403);
    expect(negado.body.erro.codigo).toBe('SEM_PERMISSAO');
    expect((await request(appProtegido).get('/api/admin').set('Cookie', admin)).status).toBe(200);
  });
});
