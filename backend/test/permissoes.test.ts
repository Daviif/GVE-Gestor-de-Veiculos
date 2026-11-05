import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import { prisma } from '../src/db';
import { gerarHashSenha } from '../src/seguranca/senha';

// Matriz de permissões (RNF08): toda rota da API, com quem pode usá-la. Rota nova entra aqui.
type Metodo = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Acesso = 'publica' | 'logado' | 'admin';

const ROTAS: [Metodo, string, Acesso][] = [
  ['get', '/api/v1/saude', 'publica'],
  ['post', '/api/v1/auth/login', 'publica'],
  ['post', '/api/v1/auth/logout', 'publica'],
  ['get', '/api/v1/auth/me', 'logado'],
  ['put', '/api/v1/auth/senha', 'logado'],
  ['get', '/api/v1/reservas/datas-permitidas', 'logado'],
  ['get', '/api/v1/reservas/disponibilidade', 'logado'],
  ['post', '/api/v1/reservas', 'logado'],
  ['get', '/api/v1/reservas/minhas', 'logado'],
  ['post', '/api/v1/reservas/1/cancelar', 'logado'],
  ['get', '/api/v1/agenda', 'logado'],
  ['get', '/api/v1/usuarios', 'admin'],
  ['post', '/api/v1/usuarios', 'admin'],
  ['put', '/api/v1/usuarios/1', 'admin'],
  ['patch', '/api/v1/usuarios/1/situacao', 'admin'],
  ['post', '/api/v1/usuarios/1/redefinir-senha', 'admin'],
  ['get', '/api/v1/feriados', 'admin'],
  ['post', '/api/v1/feriados', 'admin'],
  ['delete', '/api/v1/feriados/1', 'admin'],
  ['post', '/api/v1/feriados/importar', 'admin'],
];

/** Liberadas para quem ainda precisa trocar a senha do primeiro acesso (RF04). */
const LIBERADAS_NA_TROCA = ['/api/v1/auth/me', '/api/v1/auth/senha'];

const app = criarApp();
const SENHA = 'senha-boa-123';
const restritas = ROTAS.filter(([, , acesso]) => acesso !== 'publica');
const deAdmin = ROTAS.filter(([, , acesso]) => acesso === 'admin');

async function agenteDe(
  email: string,
  cpf: string,
  perfil: 'ADMINISTRADOR' | 'SERVIDOR',
  troca = false,
) {
  await prisma.usuario.create({
    data: {
      nome: email,
      email,
      cpf,
      senhaHash: await gerarHashSenha(SENHA),
      perfil,
      trocaSenhaObrigatoria: troca,
    },
  });
  const agente = request.agent(app);
  await agente.post('/api/v1/auth/login').send({ login: email, senha: SENHA }).expect(200);
  return agente;
}

let servidor: ReturnType<typeof request.agent>;
let pendente: ReturnType<typeof request.agent>;

beforeAll(async () => {
  await prisma.sessao.deleteMany();
  await prisma.logAuditoria.deleteMany();
  await prisma.reserva.deleteMany();
  await prisma.feriado.deleteMany();
  await prisma.veiculo.deleteMany();
  await prisma.usuario.deleteMany();
  servidor = await agenteDe('ana@gve.local', '11144477735', 'SERVIDOR');
  pendente = await agenteDe('novo@gve.local', '52998224725', 'ADMINISTRADOR', true);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('matriz de permissões', () => {
  it.each(restritas)('%s %s: sem login responde 401', async (metodo, rota) => {
    const resposta = await request(app)[metodo](rota).send({});
    expect(resposta.status).toBe(401);
    expect(resposta.body.erro.codigo).toBe('NAO_AUTENTICADO');
  });

  // O corpo vazio também testa a ordem: a permissão é conferida antes da validação.
  it.each(deAdmin)('%s %s: servidor responde 403', async (metodo, rota) => {
    const resposta = await servidor[metodo](rota).send({});
    expect(resposta.status).toBe(403);
    expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');
  });

  it.each(restritas.filter(([, rota]) => !LIBERADAS_NA_TROCA.includes(rota)))(
    '%s %s: com troca de senha pendente responde 403, mesmo sendo admin',
    async (metodo, rota) => {
      const resposta = await pendente[metodo](rota).send({});
      expect(resposta.status).toBe(403);
      expect(resposta.body.erro.codigo).toBe('TROCA_SENHA_OBRIGATORIA');
    },
  );

  it('com troca pendente, ainda consulta a sessão e troca a senha', async () => {
    expect((await pendente.get('/api/v1/auth/me')).status).toBe(200);
    // Corpo vazio: passa pela autenticação e para na validação (400), não no bloqueio (403).
    expect((await pendente.put('/api/v1/auth/senha').send({})).status).toBe(400);
  });
});
