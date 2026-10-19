import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hojeEmSaoPaulo, janelaDeDatas, paraDataBanco, somarDias } from '../src/datas';
import { criarApp } from '../src/app';
import { prisma } from '../src/db';
import { gerarHashSenha } from '../src/seguranca/senha';

const app = criarApp();

const SENHA = 'senha-boa-123';
const [DATA1, DATA2, DATA3] = janelaDeDatas(); // D+5, D+6, D+7
const DATA_FORA = somarDias(hojeEmSaoPaulo(), 2); // D+2, antes da janela

/** Cria um servidor e devolve um agente já logado. */
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

function criarVeiculo(placa: string, ativo = true) {
  return prisma.veiculo.create({ data: { placa, modelo: 'Carro', ativo } });
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

describe('GET /reservas/datas-permitidas', () => {
  it('exige login', async () => {
    const resposta = await request(app).get('/api/v1/reservas/datas-permitidas');
    expect(resposta.status).toBe(401);
  });

  it('devolve D+5 a D+7 e tira os feriados', async () => {
    await prisma.feriado.create({
      data: { data: paraDataBanco(DATA2!), descricao: 'Feriado teste', abrangencia: 'NACIONAL' },
    });
    const { agente } = await entrarLogado();
    const resposta = await agente.get('/api/v1/reservas/datas-permitidas');
    expect(resposta.status).toBe(200);
    expect(resposta.body.datas).toEqual([DATA1, DATA3]);
  });
});

describe('GET /reservas/disponibilidade', () => {
  it('marca como ocupado o veículo já reservado na data/turno', async () => {
    const { agente, usuario } = await entrarLogado();
    const ocupado = await criarVeiculo('AAA1A11');
    const livre = await criarVeiculo('BBB2B22');
    await prisma.reserva.create({
      data: {
        veiculoId: ocupado.id,
        usuarioId: usuario.id,
        data: paraDataBanco(DATA1!),
        turno: 'MATUTINO',
        destino: 'Escola Municipal',
      },
    });

    const resposta = await agente
      .get('/api/v1/reservas/disponibilidade')
      .query({ data: DATA1, turno: 'MATUTINO' });

    expect(resposta.status).toBe(200);
    const porId = Object.fromEntries(
      resposta.body.veiculos.map((v: { id: number; ocupado: boolean }) => [v.id, v.ocupado]),
    );
    expect(porId[ocupado.id]).toBe(true);
    expect(porId[livre.id]).toBe(false);
  });
});

describe('POST /reservas', () => {
  it('cria a reserva e registra na auditoria', async () => {
    const { agente, usuario } = await entrarLogado();
    const veiculo = await criarVeiculo('AAA1A11');
    const resposta = await agente
      .post('/api/v1/reservas')
      .send({ data: DATA1, turno: 'MATUTINO', veiculoId: veiculo.id, destino: ' Escola X ' });

    expect(resposta.status).toBe(201);
    expect(resposta.body.reserva).toMatchObject({
      data: DATA1,
      turno: 'MATUTINO',
      destino: 'Escola X',
      status: 'ATIVA',
      veiculo: { id: veiculo.id, placa: 'AAA1A11' },
    });
    const log = await prisma.logAuditoria.findFirst({ where: { acao: 'RESERVA_CRIADA' } });
    expect(log).toMatchObject({ usuarioId: usuario.id, entidade: 'reserva' });
  });

  it('recusa o veículo já reservado no mesmo turno com 409', async () => {
    const { agente } = await entrarLogado();
    const veiculo = await criarVeiculo('AAA1A11');
    const corpo = { data: DATA1, turno: 'MATUTINO', veiculoId: veiculo.id, destino: 'Escola X' };
    await agente.post('/api/v1/reservas').send(corpo).expect(201);
    const resposta = await agente.post('/api/v1/reservas').send(corpo);
    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('CONFLITO_RESERVA');
  });

  it('recusa data fora da janela com 422', async () => {
    const { agente } = await entrarLogado();
    const veiculo = await criarVeiculo('AAA1A11');
    const resposta = await agente
      .post('/api/v1/reservas')
      .send({ data: DATA_FORA, turno: 'MATUTINO', veiculoId: veiculo.id, destino: 'Escola X' });
    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('DATA_FORA_DA_JANELA');
  });

  it('recusa feriado com 422', async () => {
    const { agente } = await entrarLogado();
    const veiculo = await criarVeiculo('AAA1A11');
    await prisma.feriado.create({
      data: { data: paraDataBanco(DATA1!), descricao: 'Feriado', abrangencia: 'MUNICIPAL' },
    });
    const resposta = await agente
      .post('/api/v1/reservas')
      .send({ data: DATA1, turno: 'MATUTINO', veiculoId: veiculo.id, destino: 'Escola X' });
    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('DATA_FERIADO');
  });

  it('recusa veículo inativo com 422', async () => {
    const { agente } = await entrarLogado();
    const veiculo = await criarVeiculo('AAA1A11', false);
    const resposta = await agente
      .post('/api/v1/reservas')
      .send({ data: DATA1, turno: 'MATUTINO', veiculoId: veiculo.id, destino: 'Escola X' });
    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('VEICULO_INDISPONIVEL');
  });

  it('em duas tentativas simultâneas, só a primeira é aceita', async () => {
    const { agente } = await entrarLogado();
    const veiculo = await criarVeiculo('AAA1A11');
    const corpo = { data: DATA1, turno: 'MATUTINO', veiculoId: veiculo.id, destino: 'Escola X' };

    const respostas = await Promise.all([
      agente.post('/api/v1/reservas').send(corpo),
      agente.post('/api/v1/reservas').send(corpo),
    ]);
    const status = respostas.map((r) => r.status).sort();
    expect(status).toEqual([201, 409]);
    expect(await prisma.reserva.count()).toBe(1);
  });
});
