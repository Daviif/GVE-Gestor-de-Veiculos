import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import { hojeEmSaoPaulo, paraDataBanco, somarDias } from '../src/datas';
import { prisma } from '../src/db';
import { gerarHashSenha } from '../src/seguranca/senha';

const app = criarApp();

const SENHA = 'senha-boa-123';
const HOJE = hojeEmSaoPaulo();
const DAQUI_5 = somarDias(HOJE, 5);
const DAQUI_6 = somarDias(HOJE, 6);
const DAQUI_12 = somarDias(HOJE, 12);

async function entrarLogado() {
  const usuario = await prisma.usuario.create({
    data: {
      nome: 'Ana Servidora',
      email: 'ana@gve.local',
      cpf: '11144477735',
      senhaHash: await gerarHashSenha(SENHA),
      perfil: 'SERVIDOR',
      trocaSenhaObrigatoria: false,
    },
  });
  const agente = request.agent(app);
  await agente
    .post('/api/v1/auth/login')
    .send({ login: 'ana@gve.local', senha: SENHA })
    .expect(200);
  return { agente, usuario };
}

beforeEach(async () => {
  await prisma.sessao.deleteMany();
  await prisma.logAuditoria.deleteMany();
  await prisma.reserva.deleteMany();
  await prisma.feriado.deleteMany();
  await prisma.veiculo.deleteMany();
  await prisma.usuario.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /agenda', () => {
  it('exige login', async () => {
    const resposta = await request(app).get('/api/v1/agenda').query({ inicio: HOJE, fim: HOJE });
    expect(resposta.status).toBe(401);
  });

  it('devolve as reservas ativas da janela, com veículo e usuário', async () => {
    const { agente, usuario } = await entrarLogado();
    const veiculo = await prisma.veiculo.create({
      data: { placa: 'AAA1A11', modelo: 'Fiat Argo' },
    });

    // Dentro da janela.
    await prisma.reserva.create({
      data: {
        veiculoId: veiculo.id,
        usuarioId: usuario.id,
        data: paraDataBanco(DAQUI_5),
        turno: 'MATUTINO',
        destino: 'Escola A',
      },
    });
    // Fora da janela.
    await prisma.reserva.create({
      data: {
        veiculoId: veiculo.id,
        usuarioId: usuario.id,
        data: paraDataBanco(DAQUI_12),
        turno: 'MATUTINO',
        destino: 'Escola B',
      },
    });
    // Cancelada: não entra (o CHECK do banco exige quem/quando cancelou).
    await prisma.reserva.create({
      data: {
        veiculoId: veiculo.id,
        usuarioId: usuario.id,
        data: paraDataBanco(DAQUI_5),
        turno: 'VESPERTINO',
        destino: 'Cancelada',
        status: 'CANCELADA',
        canceladoEm: new Date(),
        canceladoPorId: usuario.id,
      },
    });

    const resposta = await agente.get('/api/v1/agenda').query({ inicio: DAQUI_5, fim: DAQUI_6 });
    expect(resposta.status).toBe(200);
    expect(resposta.body.reservas).toHaveLength(1);
    expect(resposta.body.reservas[0]).toMatchObject({
      data: DAQUI_5,
      turno: 'MATUTINO',
      destino: 'Escola A',
      veiculo: { placa: 'AAA1A11', modelo: 'Fiat Argo' },
      usuario: { id: usuario.id, nome: 'Ana Servidora' },
    });
  });

  it('recusa janela maior que 31 dias com 400', async () => {
    const { agente } = await entrarLogado();
    const resposta = await agente
      .get('/api/v1/agenda')
      .query({ inicio: HOJE, fim: somarDias(HOJE, 60) });
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('JANELA_MUITO_LONGA');
  });

  it('recusa fim antes do inicio com 400', async () => {
    const { agente } = await entrarLogado();
    const resposta = await agente.get('/api/v1/agenda').query({ inicio: DAQUI_6, fim: DAQUI_5 });
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('INTERVALO_INVALIDO');
  });

  it('aceita exatamente 31 dias de janela', async () => {
    const { agente } = await entrarLogado();
    const resposta = await agente
      .get('/api/v1/agenda')
      .query({ inicio: HOJE, fim: somarDias(HOJE, 30) });
    expect(resposta.status).toBe(200);
    expect(resposta.body.reservas).toEqual([]);
  });

  it('devolve os veículos ativos mesmo sem reserva, e esconde o desativado sem reserva', async () => {
    const { agente } = await entrarLogado();
    await prisma.veiculo.create({ data: { placa: 'AAA1A11', modelo: 'Fiat Argo' } });
    await prisma.veiculo.create({ data: { placa: 'BBB2B22', modelo: 'Onix', ativo: false } });

    const resposta = await agente.get('/api/v1/agenda').query({ inicio: DAQUI_5, fim: DAQUI_6 });
    expect(resposta.status).toBe(200);
    expect(resposta.body.veiculos).toEqual([
      { id: expect.any(Number), placa: 'AAA1A11', modelo: 'Fiat Argo' },
    ]);
  });

  it('mantém na grade o veículo desativado que tem reserva na janela', async () => {
    const { agente, usuario } = await entrarLogado();
    const desativado = await prisma.veiculo.create({
      data: { placa: 'BBB2B22', modelo: 'Onix', ativo: false },
    });
    await prisma.reserva.create({
      data: {
        veiculoId: desativado.id,
        usuarioId: usuario.id,
        data: paraDataBanco(DAQUI_5),
        turno: 'MATUTINO',
        destino: 'Escola A',
      },
    });

    const resposta = await agente.get('/api/v1/agenda').query({ inicio: DAQUI_5, fim: DAQUI_6 });
    expect(resposta.body.veiculos.map((v: { placa: string }) => v.placa)).toEqual(['BBB2B22']);
  });

  it('devolve os feriados da janela e ignora os de fora', async () => {
    const { agente } = await entrarLogado();
    await prisma.feriado.createMany({
      data: [
        { data: paraDataBanco(DAQUI_6), descricao: 'Dentro', abrangencia: 'MUNICIPAL' },
        { data: paraDataBanco(DAQUI_12), descricao: 'Fora', abrangencia: 'NACIONAL' },
      ],
    });

    const resposta = await agente.get('/api/v1/agenda').query({ inicio: DAQUI_5, fim: DAQUI_6 });
    expect(resposta.body.feriados).toEqual([{ data: DAQUI_6, descricao: 'Dentro' }]);
  });
});
