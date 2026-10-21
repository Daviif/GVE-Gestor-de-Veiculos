import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import { hojeEmSaoPaulo, paraDataBanco, somarDias } from '../src/datas';
import { prisma } from '../src/db';
import { gerarHashSenha } from '../src/seguranca/senha';

const app = criarApp();

const SENHA = 'senha-boa-123';

async function entrarComo(perfil: 'ADMINISTRADOR' | 'SERVIDOR') {
  const email = perfil === 'ADMINISTRADOR' ? 'admin@gve.local' : 'ana@gve.local';
  const usuario = await prisma.usuario.create({
    data: {
      nome: perfil === 'ADMINISTRADOR' ? 'Administrador' : 'Ana Servidora',
      email,
      cpf: perfil === 'ADMINISTRADOR' ? '52998224725' : '11144477735',
      senhaHash: await gerarHashSenha(SENHA),
      perfil,
      trocaSenhaObrigatoria: false,
    },
  });
  const agente = request.agent(app);
  await agente.post('/api/v1/auth/login').send({ login: email, senha: SENHA }).expect(200);
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

const HOJE = hojeEmSaoPaulo();
const AMANHA = somarDias(HOJE, 1);
const ONTEM = somarDias(HOJE, -1);

describe('GET /historico', () => {
  it('exige login', async () => {
    const resposta = await request(app).get('/api/v1/historico');
    expect(resposta.status).toBe(401);
  });

  it('o servidor não acessa', async () => {
    const { agente } = await entrarComo('SERVIDOR');
    const resposta = await agente.get('/api/v1/historico');
    expect(resposta.status).toBe(403);
  });

  it('lista as reservas da mais recente para a mais antiga, com veículo e usuário', async () => {
    const { agente, usuario } = await entrarComo('ADMINISTRADOR');
    const veiculo = await prisma.veiculo.create({
      data: { placa: 'AAA1A11', modelo: 'Fiat Argo' },
    });
    await prisma.reserva.createMany({
      data: [
        {
          veiculoId: veiculo.id,
          usuarioId: usuario.id,
          data: paraDataBanco(ONTEM),
          turno: 'MATUTINO',
          destino: 'Escola A',
        },
        {
          veiculoId: veiculo.id,
          usuarioId: usuario.id,
          data: paraDataBanco(AMANHA),
          turno: 'MATUTINO',
          destino: 'Escola B',
        },
      ],
    });

    const resposta = await agente.get('/api/v1/historico');
    expect(resposta.status).toBe(200);
    expect(resposta.body.total).toBe(2);
    expect(resposta.body.itens[0]).toMatchObject({
      data: AMANHA,
      situacao: 'AGENDADA',
      destino: 'Escola B',
      veiculo: { placa: 'AAA1A11' },
      usuario: { nome: 'Administrador' },
    });
    expect(resposta.body.itens[1]).toMatchObject({ data: ONTEM, situacao: 'CONCLUIDA' });
  });

  it('marca reserva cancelada como CANCELADA independentemente da data', async () => {
    const { agente, usuario } = await entrarComo('ADMINISTRADOR');
    const veiculo = await prisma.veiculo.create({
      data: { placa: 'AAA1A11', modelo: 'Fiat Argo' },
    });
    await prisma.reserva.create({
      data: {
        veiculoId: veiculo.id,
        usuarioId: usuario.id,
        data: paraDataBanco(AMANHA),
        turno: 'MATUTINO',
        destino: 'Cancelada',
        status: 'CANCELADA',
        canceladoEm: new Date(),
        canceladoPorId: usuario.id,
      },
    });

    const resposta = await agente.get('/api/v1/historico');
    expect(resposta.body.itens[0].situacao).toBe('CANCELADA');
  });

  it('filtra por veículo', async () => {
    const { agente, usuario } = await entrarComo('ADMINISTRADOR');
    const alvo = await prisma.veiculo.create({ data: { placa: 'AAA1A11', modelo: 'Argo' } });
    const outro = await prisma.veiculo.create({ data: { placa: 'BBB2B22', modelo: 'Onix' } });
    await prisma.reserva.create({
      data: {
        veiculoId: alvo.id,
        usuarioId: usuario.id,
        data: paraDataBanco(AMANHA),
        turno: 'MATUTINO',
        destino: 'A',
      },
    });
    await prisma.reserva.create({
      data: {
        veiculoId: outro.id,
        usuarioId: usuario.id,
        data: paraDataBanco(AMANHA),
        turno: 'VESPERTINO',
        destino: 'B',
      },
    });

    const resposta = await agente.get('/api/v1/historico').query({ veiculoId: alvo.id });
    expect(resposta.body.total).toBe(1);
    expect(resposta.body.itens[0].veiculo.id).toBe(alvo.id);
  });

  it('filtra por servidor', async () => {
    const { agente, usuario: admin } = await entrarComo('ADMINISTRADOR');
    const outro = await prisma.usuario.create({
      data: { nome: 'Outro', email: 'o@gve.local', cpf: '11144477735', senhaHash: 'x' },
    });
    const veiculo = await prisma.veiculo.create({
      data: { placa: 'AAA1A11', modelo: 'Argo' },
    });
    await prisma.reserva.create({
      data: {
        veiculoId: veiculo.id,
        usuarioId: admin.id,
        data: paraDataBanco(AMANHA),
        turno: 'MATUTINO',
        destino: 'A',
      },
    });
    await prisma.reserva.create({
      data: {
        veiculoId: veiculo.id,
        usuarioId: outro.id,
        data: paraDataBanco(AMANHA),
        turno: 'VESPERTINO',
        destino: 'B',
      },
    });

    const resposta = await agente.get('/api/v1/historico').query({ usuarioId: outro.id });
    expect(resposta.body.total).toBe(1);
    expect(resposta.body.itens[0].usuario.id).toBe(outro.id);
  });

  it('filtra por período, inclusivo nos dois lados', async () => {
    const { agente, usuario } = await entrarComo('ADMINISTRADOR');
    const veiculo = await prisma.veiculo.create({
      data: { placa: 'AAA1A11', modelo: 'Argo' },
    });
    await prisma.reserva.createMany({
      data: [
        {
          veiculoId: veiculo.id,
          usuarioId: usuario.id,
          data: paraDataBanco(somarDias(HOJE, -5)),
          turno: 'MATUTINO',
          destino: 'Fora de baixo',
        },
        {
          veiculoId: veiculo.id,
          usuarioId: usuario.id,
          data: paraDataBanco(somarDias(HOJE, -2)),
          turno: 'MATUTINO',
          destino: 'Dentro',
        },
        {
          veiculoId: veiculo.id,
          usuarioId: usuario.id,
          data: paraDataBanco(HOJE),
          turno: 'MATUTINO',
          destino: 'Dentro borda',
        },
        {
          veiculoId: veiculo.id,
          usuarioId: usuario.id,
          data: paraDataBanco(somarDias(HOJE, 1)),
          turno: 'MATUTINO',
          destino: 'Fora de cima',
        },
      ],
    });

    const resposta = await agente
      .get('/api/v1/historico')
      .query({ inicio: somarDias(HOJE, -3), fim: HOJE });
    expect(resposta.body.total).toBe(2);
  });

  it('pagina corretamente', async () => {
    const { agente, usuario } = await entrarComo('ADMINISTRADOR');
    const veiculo = await prisma.veiculo.create({
      data: { placa: 'AAA1A11', modelo: 'Argo' },
    });
    // 20 reservas em datas distintas (uma por dia, 20 dias para trás) para evitar
    // o índice único de reserva ativa por veículo/data/turno.
    await prisma.reserva.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        veiculoId: veiculo.id,
        usuarioId: usuario.id,
        data: paraDataBanco(somarDias(HOJE, -(i + 1))),
        turno: 'MATUTINO' as const,
        destino: `R${i}`,
      })),
    });

    const p1 = await agente.get('/api/v1/historico').query({ pagina: 1, tamanho: 7 });
    expect(p1.body.itens).toHaveLength(7);
    expect(p1.body.total).toBe(20);

    const p3 = await agente.get('/api/v1/historico').query({ pagina: 3, tamanho: 7 });
    expect(p3.body.itens).toHaveLength(6);
    const ids1 = new Set<number>(p1.body.itens.map((i: { id: number }) => i.id));
    for (const i of p3.body.itens) {
      expect(ids1.has((i as { id: number }).id)).toBe(false);
    }
  });

  it('recusa fim antes do inicio', async () => {
    const { agente } = await entrarComo('ADMINISTRADOR');
    const resposta = await agente.get('/api/v1/historico').query({ inicio: AMANHA, fim: ONTEM });
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('INTERVALO_INVALIDO');
  });
});
