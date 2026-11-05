import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hojeEmSaoPaulo, janelaDeDatas, paraDataBanco, somarDias } from '../src/datas';
import { criarApp } from '../src/app';
import { prisma } from '../src/db';
import { gerarHashSenha } from '../src/seguranca/senha';

const app = criarApp();

const SENHA = 'senha-boa-123';
const [DATA1, DATA2, DATA3] = janelaDeDatas(); // D+5, D+6, D+7
const DATA_FORA = somarDias(hojeEmSaoPaulo(), 2); // D+2, antes da janela

interface OpcoesUsuario {
  nome?: string;
  email?: string;
  cpf?: string;
  perfil?: 'SERVIDOR' | 'ADMINISTRADOR';
}

/** Cria um usuário e devolve um agente já logado. */
async function entrarLogado(opcoes: OpcoesUsuario = {}) {
  const usuario = await prisma.usuario.create({
    data: {
      nome: opcoes.nome ?? 'Ana Servidora',
      email: opcoes.email ?? 'ana@gve.local',
      cpf: opcoes.cpf ?? '11144477735',
      senhaHash: await gerarHashSenha(SENHA),
      perfil: opcoes.perfil ?? 'SERVIDOR',
      trocaSenhaObrigatoria: false,
    },
  });
  const agente = request.agent(app);
  await agente.post('/api/v1/auth/login').send({ login: usuario.email, senha: SENHA }).expect(200);
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

describe('regras da nova reserva', () => {
  const HOJE = hojeEmSaoPaulo();
  const reservar = (agente: ReturnType<typeof request.agent>, corpo: object) =>
    agente.post('/api/v1/reservas').send(corpo);

  it('janela: aceita D+5 e D+7, recusa D+4 e D+8 (RN02)', async () => {
    const { agente } = await entrarLogado();
    const veiculo = await criarVeiculo('AAA1A11');
    const corpo = (dias: number) => ({
      data: somarDias(HOJE, dias),
      turno: 'MATUTINO',
      veiculoId: veiculo.id,
      destino: 'Escola X',
    });

    for (const dias of [4, 8]) {
      const resposta = await reservar(agente, corpo(dias));
      expect(resposta.status, `D+${dias}`).toBe(422);
      expect(resposta.body.erro.codigo).toBe('DATA_FORA_DA_JANELA');
    }
    for (const dias of [5, 7]) {
      expect((await reservar(agente, corpo(dias))).status, `D+${dias}`).toBe(201);
    }
  });

  it('depois de cancelada, a vaga pode ser reservada de novo (RN01)', async () => {
    const { agente } = await entrarLogado();
    const veiculo = await criarVeiculo('AAA1A11');
    const corpo = { data: DATA1, turno: 'MATUTINO', veiculoId: veiculo.id, destino: 'Escola X' };

    const primeira = await reservar(agente, corpo);
    await agente.post(`/api/v1/reservas/${primeira.body.reserva.id}/cancelar`).send({}).expect(200);
    expect((await reservar(agente, corpo)).status).toBe(201);
  });

  it('o mesmo servidor reserva os dois turnos e mais de um carro no dia (RN03, RN04)', async () => {
    const { agente } = await entrarLogado();
    const carro1 = await criarVeiculo('AAA1A11');
    const carro2 = await criarVeiculo('BBB2B22');
    const base = { data: DATA1, destino: 'Escola X' };

    expect(
      (await reservar(agente, { ...base, turno: 'MATUTINO', veiculoId: carro1.id })).status,
    ).toBe(201);
    expect(
      (await reservar(agente, { ...base, turno: 'VESPERTINO', veiculoId: carro1.id })).status,
    ).toBe(201);
    expect(
      (await reservar(agente, { ...base, turno: 'MATUTINO', veiculoId: carro2.id })).status,
    ).toBe(201);
  });

  it('aceita sábado e domingo; só o feriado cadastrado bloqueia (RN11)', async () => {
    // Segunda, 19/10/2026, 9h em Brasília: a janela é sáb 24, dom 25 e seg 26.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
    try {
      const { agente } = await entrarLogado();
      const veiculo = await criarVeiculo('AAA1A11');
      await prisma.feriado.create({
        data: { data: paraDataBanco('2026-10-26'), descricao: 'Feriado', abrangencia: 'MUNICIPAL' },
      });
      const corpo = (data: string) => ({
        data,
        turno: 'MATUTINO',
        veiculoId: veiculo.id,
        destino: 'Escola X',
      });

      const permitidas = await agente.get('/api/v1/reservas/datas-permitidas').expect(200);
      expect(permitidas.body.datas).toEqual(['2026-10-24', '2026-10-25']);

      expect((await reservar(agente, corpo('2026-10-24'))).status, 'sábado').toBe(201);
      expect((await reservar(agente, corpo('2026-10-25'))).status, 'domingo').toBe(201);
      const feriado = await reservar(agente, corpo('2026-10-26'));
      expect(feriado.status, 'feriado').toBe(422);
      expect(feriado.body.erro.codigo).toBe('DATA_FERIADO');
    } finally {
      vi.useRealTimers();
    }
  });

  it('recusa turno que não existe (RN04) e destino vazio (RN06)', async () => {
    const { agente } = await entrarLogado();
    const veiculo = await criarVeiculo('AAA1A11');
    const base = { data: DATA1, turno: 'MATUTINO', veiculoId: veiculo.id, destino: 'Escola X' };

    const turno = await reservar(agente, { ...base, turno: 'NOTURNO' });
    expect(turno.status).toBe(400);
    expect(turno.body.erro.mensagem).toBe('Selecione o turno.');

    const destino = await reservar(agente, { ...base, destino: '   ' });
    expect(destino.status).toBe(400);
    expect(destino.body.erro.mensagem).toBe('Informe o destino.');
    expect(await prisma.reserva.count()).toBe(0);
  });
});

describe('GET /reservas/minhas', () => {
  it('devolve só as reservas do próprio usuário', async () => {
    const { agente, usuario } = await entrarLogado();
    const outro = await prisma.usuario.create({
      data: {
        nome: 'Outro',
        email: 'outro@gve.local',
        cpf: '39053344705',
        senhaHash: 'x',
      },
    });
    const veiculo = await criarVeiculo('AAA1A11');
    await prisma.reserva.create({
      data: {
        veiculoId: veiculo.id,
        usuarioId: usuario.id,
        data: paraDataBanco(DATA1!),
        turno: 'MATUTINO',
        destino: 'Minha',
      },
    });
    await prisma.reserva.create({
      data: {
        veiculoId: veiculo.id,
        usuarioId: outro.id,
        data: paraDataBanco(DATA2!),
        turno: 'MATUTINO',
        destino: 'Do outro',
      },
    });

    const resposta = await agente.get('/api/v1/reservas/minhas');
    expect(resposta.status).toBe(200);
    expect(resposta.body.reservas).toHaveLength(1);
    expect(resposta.body.reservas[0]).toMatchObject({
      destino: 'Minha',
      status: 'ATIVA',
      veiculo: { placa: 'AAA1A11' },
    });
  });
});

describe('POST /reservas/:id/cancelar', () => {
  async function criarReservaDe(usuarioId: number, data = DATA1!) {
    const veiculo = await criarVeiculo('AAA1A11');
    return prisma.reserva.create({
      data: {
        veiculoId: veiculo.id,
        usuarioId,
        data: paraDataBanco(data),
        turno: 'MATUTINO',
        destino: 'Escola X',
      },
    });
  }

  it('o autor cancela a própria reserva e o carro volta a aparecer livre', async () => {
    const { agente, usuario } = await entrarLogado();
    const reserva = await criarReservaDe(usuario.id);

    const resposta = await agente.post(`/api/v1/reservas/${reserva.id}/cancelar`).send({});
    expect(resposta.status).toBe(200);
    expect(resposta.body.reserva.status).toBe('CANCELADA');

    // Agora o mesmo veículo pode ser reservado de novo no mesmo turno (RN01).
    const disp = await agente
      .get('/api/v1/reservas/disponibilidade')
      .query({ data: DATA1, turno: 'MATUTINO' });
    const veiculo = disp.body.veiculos.find((v: { id: number }) => v.id === reserva.veiculoId);
    expect(veiculo.ocupado).toBe(false);

    const log = await prisma.logAuditoria.findFirst({ where: { acao: 'RESERVA_CANCELADA' } });
    expect(log).toMatchObject({ usuarioId: usuario.id, entidade: 'reserva' });
  });

  it('o servidor não cancela a reserva de outro (403)', async () => {
    const { agente } = await entrarLogado();
    const outro = await prisma.usuario.create({
      data: { nome: 'Outro', email: 'outro@gve.local', cpf: '39053344705', senhaHash: 'x' },
    });
    const reserva = await criarReservaDe(outro.id);

    const resposta = await agente.post(`/api/v1/reservas/${reserva.id}/cancelar`).send({});
    expect(resposta.status).toBe(403);
    expect((await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.id } })).status).toBe(
      'ATIVA',
    );
  });

  it('o administrador cancela a reserva de outro, com motivo obrigatório', async () => {
    const { agente } = await entrarLogado({
      email: 'admin@gve.local',
      cpf: '52998224725',
      perfil: 'ADMINISTRADOR',
    });
    const dono = await prisma.usuario.create({
      data: { nome: 'Dono', email: 'dono@gve.local', cpf: '11144477735', senhaHash: 'x' },
    });
    const reserva = await criarReservaDe(dono.id);

    // Sem motivo: recusa.
    const semMotivo = await agente.post(`/api/v1/reservas/${reserva.id}/cancelar`).send({});
    expect(semMotivo.status).toBe(400);
    expect(semMotivo.body.erro.codigo).toBe('MOTIVO_OBRIGATORIO');

    // Com motivo: aceita e registra o motivo na auditoria.
    const comMotivo = await agente
      .post(`/api/v1/reservas/${reserva.id}/cancelar`)
      .send({ motivo: 'Veículo em manutenção' });
    expect(comMotivo.status).toBe(200);
    expect(comMotivo.body.reserva.status).toBe('CANCELADA');

    const log = await prisma.logAuditoria.findFirst({ where: { acao: 'RESERVA_CANCELADA' } });
    expect(log?.detalhes).toMatchObject({ motivo: 'Veículo em manutenção' });
  });

  it('não cancela reserva passada (RN05, 409)', async () => {
    const { agente, usuario } = await entrarLogado();
    const reserva = await criarReservaDe(usuario.id, somarDias(hojeEmSaoPaulo(), -1));

    const resposta = await agente.post(`/api/v1/reservas/${reserva.id}/cancelar`).send({});
    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('RESERVA_PASSADA');
  });

  it('não cancela duas vezes (409)', async () => {
    const { agente, usuario } = await entrarLogado();
    const reserva = await criarReservaDe(usuario.id);
    await agente.post(`/api/v1/reservas/${reserva.id}/cancelar`).send({}).expect(200);
    const resposta = await agente.post(`/api/v1/reservas/${reserva.id}/cancelar`).send({});
    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('JA_CANCELADA');
  });

  it('reserva inexistente responde 404', async () => {
    const { agente } = await entrarLogado();
    const resposta = await agente.post('/api/v1/reservas/9999/cancelar').send({});
    expect(resposta.status).toBe(404);
  });

  describe('reserva de hoje: só até o turno começar (RN05)', () => {
    const HOJE = hojeEmSaoPaulo();
    // Horários de Brasília escritos em UTC (UTC-3): 06:59 = 09:59Z, 07:00 = 10:00Z.
    const relogio = (horaUtc: string) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(`${HOJE}T${horaUtc}:00Z`));
    };

    afterEach(() => {
      vi.useRealTimers();
    });

    async function reservaDeHoje(usuarioId: number, turno: 'MATUTINO' | 'VESPERTINO') {
      const veiculo = await criarVeiculo(turno === 'MATUTINO' ? 'AAA1A11' : 'BBB2B22');
      return prisma.reserva.create({
        data: {
          veiculoId: veiculo.id,
          usuarioId,
          data: paraDataBanco(HOJE),
          turno,
          destino: 'Escola X',
        },
      });
    }

    it('às 6h59 ainda cancela a matutina', async () => {
      relogio('09:59');
      const { agente, usuario } = await entrarLogado();
      const reserva = await reservaDeHoje(usuario.id, 'MATUTINO');
      expect((await agente.post(`/api/v1/reservas/${reserva.id}/cancelar`).send({})).status).toBe(
        200,
      );
    });

    it('às 7h a matutina já começou, mas a vespertina ainda cancela até as 13h', async () => {
      relogio('10:00');
      const { agente, usuario } = await entrarLogado();
      const matutina = await reservaDeHoje(usuario.id, 'MATUTINO');
      const vespertina = await reservaDeHoje(usuario.id, 'VESPERTINO');

      const recusada = await agente.post(`/api/v1/reservas/${matutina.id}/cancelar`).send({});
      expect(recusada.status).toBe(409);
      expect(recusada.body.erro.codigo).toBe('RESERVA_PASSADA');
      expect(
        (await agente.post(`/api/v1/reservas/${vespertina.id}/cancelar`).send({})).status,
      ).toBe(200);
    });

    it('às 13h a vespertina também já começou', async () => {
      relogio('16:00');
      const { agente, usuario } = await entrarLogado();
      const vespertina = await reservaDeHoje(usuario.id, 'VESPERTINO');
      expect(
        (await agente.post(`/api/v1/reservas/${vespertina.id}/cancelar`).send({})).status,
      ).toBe(409);
    });
  });
});
