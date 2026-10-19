import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import { prisma } from '../src/db';
import { conferirSenha, gerarHashSenha } from '../src/seguranca/senha';

const app = criarApp();

const SENHA = 'senha-boa-123';

// CPFs válidos distintos para os testes.
const CPF_ADMIN = '52998224725';
const CPF_SERVIDORA = '11144477735';
const CPF_NOVO = '12345678909';

/** Cria o usuário e devolve um agente já logado. */
async function entrarComo(perfil: 'ADMINISTRADOR' | 'SERVIDOR') {
  const email = perfil === 'ADMINISTRADOR' ? 'admin@gve.local' : 'ana@gve.local';
  const usuario = await prisma.usuario.create({
    data: {
      nome: perfil === 'ADMINISTRADOR' ? 'Administrador' : 'Ana Servidora',
      email,
      cpf: perfil === 'ADMINISTRADOR' ? CPF_ADMIN : CPF_SERVIDORA,
      senhaHash: await gerarHashSenha(SENHA),
      perfil,
      trocaSenhaObrigatoria: false,
    },
  });
  const agente = request.agent(app);
  await agente.post('/api/v1/auth/login').send({ login: email, senha: SENHA }).expect(200);
  return { agente, usuario };
}

/** Cria um servidor comum já logado (para checar que a sessão cai ao desativá-lo). */
async function criarServidorLogado(email: string, cpf: string) {
  const usuario = await prisma.usuario.create({
    data: {
      nome: 'Carlos Servidor',
      email,
      cpf,
      senhaHash: await gerarHashSenha(SENHA),
      perfil: 'SERVIDOR',
      trocaSenhaObrigatoria: false,
    },
  });
  const agente = request.agent(app);
  await agente.post('/api/v1/auth/login').send({ login: email, senha: SENHA }).expect(200);
  return usuario;
}

beforeEach(async () => {
  await prisma.sessao.deleteMany();
  await prisma.logAuditoria.deleteMany();
  await prisma.reserva.deleteMany();
  await prisma.veiculo.deleteMany();
  await prisma.usuario.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /usuarios', () => {
  it('exige login', async () => {
    const resposta = await request(app).get('/api/v1/usuarios');
    expect(resposta.status).toBe(401);
  });

  it('o servidor não acessa', async () => {
    const { agente } = await entrarComo('SERVIDOR');
    const resposta = await agente.get('/api/v1/usuarios');
    expect(resposta.status).toBe(403);
  });

  it('o administrador lista todos, com os inativos por último', async () => {
    await prisma.usuario.createMany({
      data: [
        {
          nome: 'Bruno',
          email: 'bruno@gve.local',
          cpf: CPF_NOVO,
          senhaHash: 'x',
          ativo: false,
        },
      ],
    });
    const { agente } = await entrarComo('ADMINISTRADOR');
    const resposta = await agente.get('/api/v1/usuarios');
    expect(resposta.status).toBe(200);
    const nomes = resposta.body.usuarios.map((u: { nome: string }) => u.nome);
    expect(nomes).toEqual(['Administrador', 'Bruno']);
    // A senha nunca sai da API.
    expect(resposta.body.usuarios[0]).not.toHaveProperty('senhaHash');
  });
});

describe('POST /usuarios', () => {
  it('cadastra, devolve a senha provisória e obriga a troca', async () => {
    const { agente, usuario: admin } = await entrarComo('ADMINISTRADOR');
    const resposta = await agente.post('/api/v1/usuarios').send({
      nome: ' Carlos Servidor ',
      email: 'Carlos@GVE.local',
      cpf: '123.456.789-09',
      perfil: 'SERVIDOR',
    });

    expect(resposta.status).toBe(201);
    expect(resposta.body.usuario).toMatchObject({
      nome: 'Carlos Servidor',
      email: 'carlos@gve.local',
      cpf: CPF_NOVO,
      perfil: 'SERVIDOR',
      ativo: true,
      trocaSenhaObrigatoria: true,
    });
    expect(resposta.body.senhaProvisoria).toHaveLength(10);

    // A senha provisória devolvida é mesmo a que foi gravada.
    const salvo = await prisma.usuario.findUniqueOrThrow({ where: { cpf: CPF_NOVO } });
    expect(await conferirSenha(salvo.senhaHash, resposta.body.senhaProvisoria)).toBe(true);

    const log = await prisma.logAuditoria.findFirst({ where: { acao: 'USUARIO_CRIADO' } });
    expect(log).toMatchObject({ usuarioId: admin.id, entidade: 'usuario', entidadeId: salvo.id });
  });

  it('recusa e-mail repetido com 409', async () => {
    const { agente } = await entrarComo('ADMINISTRADOR');
    await prisma.usuario.create({
      data: { nome: 'Carlos', email: 'carlos@gve.local', cpf: CPF_NOVO, senhaHash: 'x' },
    });
    const resposta = await agente.post('/api/v1/usuarios').send({
      nome: 'Outro',
      email: 'carlos@gve.local',
      cpf: '390.533.447-05',
      perfil: 'SERVIDOR',
    });
    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('EMAIL_DUPLICADO');
  });

  it('recusa CPF repetido com 409', async () => {
    const { agente } = await entrarComo('ADMINISTRADOR');
    await prisma.usuario.create({
      data: { nome: 'Carlos', email: 'carlos@gve.local', cpf: CPF_NOVO, senhaHash: 'x' },
    });
    const resposta = await agente
      .post('/api/v1/usuarios')
      .send({ nome: 'Outro', email: 'outro@gve.local', cpf: CPF_NOVO, perfil: 'SERVIDOR' });
    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('CPF_DUPLICADO');
  });

  it('recusa CPF inválido com 400', async () => {
    const { agente } = await entrarComo('ADMINISTRADOR');
    const resposta = await agente
      .post('/api/v1/usuarios')
      .send({ nome: 'Carlos', email: 'carlos@gve.local', cpf: '11111111111', perfil: 'SERVIDOR' });
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('o servidor não cadastra', async () => {
    const { agente } = await entrarComo('SERVIDOR');
    const resposta = await agente
      .post('/api/v1/usuarios')
      .send({ nome: 'Carlos', email: 'carlos@gve.local', cpf: CPF_NOVO, perfil: 'SERVIDOR' });
    expect(resposta.status).toBe(403);
    expect(await prisma.usuario.count()).toBe(1);
  });
});

describe('PATCH /usuarios/:id/situacao', () => {
  it('desativa encerrando as sessões e depois reativa', async () => {
    const { agente } = await entrarComo('ADMINISTRADOR');
    const alvo = await criarServidorLogado('carlos@gve.local', CPF_NOVO);
    expect(await prisma.sessao.count({ where: { usuarioId: alvo.id } })).toBe(1);

    const desativado = await agente
      .patch(`/api/v1/usuarios/${alvo.id}/situacao`)
      .send({ ativo: false });
    expect(desativado.status).toBe(200);
    expect(desativado.body.usuario.ativo).toBe(false);
    expect(await prisma.sessao.count({ where: { usuarioId: alvo.id } })).toBe(0);

    const reativado = await agente
      .patch(`/api/v1/usuarios/${alvo.id}/situacao`)
      .send({ ativo: true });
    expect(reativado.body.usuario.ativo).toBe(true);

    const acoes = await prisma.logAuditoria.findMany({
      where: { entidade: 'usuario' },
      orderBy: { id: 'asc' },
      select: { acao: true },
    });
    expect(acoes.map((a) => a.acao)).toEqual(['USUARIO_DESATIVADO', 'USUARIO_ATIVADO']);
  });

  it('não deixa o administrador desativar a si mesmo', async () => {
    const { agente, usuario: admin } = await entrarComo('ADMINISTRADOR');
    const resposta = await agente
      .patch(`/api/v1/usuarios/${admin.id}/situacao`)
      .send({ ativo: false });
    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('OPERACAO_INVALIDA');
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: admin.id } })).ativo).toBe(true);
  });
});

describe('POST /usuarios/:id/redefinir-senha', () => {
  it('gera nova senha, obriga a troca e encerra as sessões', async () => {
    const { agente } = await entrarComo('ADMINISTRADOR');
    const alvo = await criarServidorLogado('carlos@gve.local', CPF_NOVO);

    const resposta = await agente.post(`/api/v1/usuarios/${alvo.id}/redefinir-senha`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.senhaProvisoria).toHaveLength(10);

    const salvo = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
    expect(salvo.trocaSenhaObrigatoria).toBe(true);
    expect(await conferirSenha(salvo.senhaHash, resposta.body.senhaProvisoria)).toBe(true);
    // A senha antiga deixa de valer.
    expect(await conferirSenha(salvo.senhaHash, SENHA)).toBe(false);
    expect(await prisma.sessao.count({ where: { usuarioId: alvo.id } })).toBe(0);

    const log = await prisma.logAuditoria.findFirst({ where: { acao: 'SENHA_REDEFINIDA' } });
    expect(log).toMatchObject({ entidade: 'usuario', entidadeId: alvo.id });
  });
});
