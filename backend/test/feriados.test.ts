import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApp } from '../src/app';
import { janelaDeDatas, paraDataBanco } from '../src/datas';
import { prisma } from '../src/db';
import { gerarHashSenha } from '../src/seguranca/senha';

const app = criarApp();

const SENHA = 'senha-boa-123';
const [DATA1] = janelaDeDatas();

/** Cria o usuário e devolve um agente já logado. */
async function entrarComo(perfil: 'ADMINISTRADOR' | 'SERVIDOR' = 'ADMINISTRADOR') {
  const admin = perfil === 'ADMINISTRADOR';
  const usuario = await prisma.usuario.create({
    data: {
      nome: admin ? 'Administrador' : 'Ana Servidora',
      email: admin ? 'admin@gve.local' : 'ana@gve.local',
      cpf: admin ? '52998224725' : '11144477735',
      senhaHash: await gerarHashSenha(SENHA),
      perfil,
      trocaSenhaObrigatoria: false,
    },
  });
  const agente = request.agent(app);
  await agente.post('/api/v1/auth/login').send({ login: usuario.email, senha: SENHA }).expect(200);
  return { agente, usuario };
}

/** Faz o fetch da BrasilAPI devolver `corpo` (ou falhar, se for um Error). */
function simularBrasilApi(corpo: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    if (corpo instanceof Error) throw corpo;
    return new Response(JSON.stringify(corpo), { status });
  });
}

const NACIONAIS_2026 = [
  { date: '2026-01-01', name: 'Confraternização mundial', type: 'national' },
  { date: '2026-04-21', name: 'Tiradentes', type: 'national' },
  { date: '2026-12-25', name: 'Natal', type: 'national' },
];

beforeEach(async () => {
  await prisma.sessao.deleteMany();
  await prisma.logAuditoria.deleteMany();
  await prisma.reserva.deleteMany();
  await prisma.feriado.deleteMany();
  await prisma.veiculo.deleteMany();
  await prisma.usuario.deleteMany();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('acesso', () => {
  it('é exclusivo do administrador', async () => {
    const { agente } = await entrarComo('SERVIDOR');
    expect((await agente.get('/api/v1/feriados')).status).toBe(403);
    expect((await agente.post('/api/v1/feriados').send({})).status).toBe(403);
  });

  it('exige sessão', async () => {
    expect((await request(app).get('/api/v1/feriados')).status).toBe(401);
  });
});

describe('GET /feriados', () => {
  it('lista os feriados do ano pedido, em ordem de data', async () => {
    const { agente } = await entrarComo();
    await prisma.feriado.createMany({
      data: [
        { data: paraDataBanco('2026-11-02'), descricao: 'Finados', abrangencia: 'NACIONAL' },
        { data: paraDataBanco('2026-01-01'), descricao: 'Ano Novo', abrangencia: 'NACIONAL' },
        { data: paraDataBanco('2027-01-01'), descricao: 'Ano Novo', abrangencia: 'NACIONAL' },
      ],
    });

    const resposta = await agente.get('/api/v1/feriados?ano=2026');
    expect(resposta.status).toBe(200);
    expect(resposta.body.feriados.map((f: { data: string }) => f.data)).toEqual([
      '2026-01-01',
      '2026-11-02',
    ]);
  });

  it('recusa ano inválido', async () => {
    const { agente } = await entrarComo();
    const resposta = await agente.get('/api/v1/feriados?ano=abc');
    expect(resposta.status).toBe(400);
  });
});

describe('POST /feriados', () => {
  it('cadastra e registra no log', async () => {
    const { agente, usuario } = await entrarComo();
    const resposta = await agente.post('/api/v1/feriados').send({
      data: '2026-07-16',
      descricao: '  Aniversário da cidade ',
      abrangencia: 'MUNICIPAL',
    });

    expect(resposta.status).toBe(201);
    expect(resposta.body.feriado).toMatchObject({
      data: '2026-07-16',
      descricao: 'Aniversário da cidade',
      abrangencia: 'MUNICIPAL',
      reservasAtivas: 0,
    });
    const salvo = await prisma.feriado.findUniqueOrThrow({
      where: { id: resposta.body.feriado.id },
    });
    expect(salvo.criadoPorId).toBe(usuario.id);
    const log = await prisma.logAuditoria.findFirst({ where: { acao: 'FERIADO_CRIADO' } });
    expect(log).toMatchObject({ entidade: 'feriado', entidadeId: salvo.id, usuarioId: usuario.id });
  });

  it('avisa quando a data já tem reservas ativas (RN11)', async () => {
    const { agente, usuario } = await entrarComo();
    const veiculo = await prisma.veiculo.create({ data: { placa: 'ABC1D23', modelo: 'Carro' } });
    const reserva = { veiculoId: veiculo.id, usuarioId: usuario.id, data: paraDataBanco(DATA1!) };
    await prisma.reserva.createMany({
      data: [
        { ...reserva, turno: 'MATUTINO', destino: 'Escola A' },
        {
          ...reserva,
          turno: 'VESPERTINO',
          destino: 'Escola B',
          status: 'CANCELADA',
          canceladoEm: new Date(),
          canceladoPorId: usuario.id,
        },
      ],
    });

    const resposta = await agente
      .post('/api/v1/feriados')
      .send({ data: DATA1, descricao: 'Ponto facultativo', abrangencia: 'MUNICIPAL' });
    expect(resposta.status).toBe(201);
    // Só a ativa conta; a reserva não é cancelada, o administrador decide.
    expect(resposta.body.feriado.reservasAtivas).toBe(1);
    expect(await prisma.reserva.count({ where: { status: 'ATIVA' } })).toBe(1);
  });

  it('recusa data repetida', async () => {
    const { agente } = await entrarComo();
    const corpo = { data: '2026-07-16', descricao: 'Aniversário', abrangencia: 'MUNICIPAL' };
    await agente.post('/api/v1/feriados').send(corpo).expect(201);

    const resposta = await agente.post('/api/v1/feriados').send(corpo);
    expect(resposta.status).toBe(409);
    expect(resposta.body.erro.codigo).toBe('FERIADO_DUPLICADO');
  });

  it('valida a entrada', async () => {
    const { agente } = await entrarComo();
    const enviar = (corpo: object) => agente.post('/api/v1/feriados').send(corpo);
    const valido = { data: '2026-07-16', descricao: 'Aniversário', abrangencia: 'MUNICIPAL' };

    expect((await enviar({ ...valido, data: '2026-02-30' })).body.erro.mensagem).toBe(
      'Data inválida.',
    );
    expect((await enviar({ ...valido, descricao: '   ' })).body.erro.mensagem).toBe(
      'Informe o nome do feriado.',
    );
    expect((await enviar({ ...valido, abrangencia: 'MUNDIAL' })).body.erro.mensagem).toBe(
      'Selecione a abrangência.',
    );
    expect(await prisma.feriado.count()).toBe(0);
  });
});

describe('DELETE /feriados/:id', () => {
  it('remove e registra no log', async () => {
    const { agente } = await entrarComo();
    const feriado = await prisma.feriado.create({
      data: {
        data: paraDataBanco('2026-07-16'),
        descricao: 'Aniversário',
        abrangencia: 'MUNICIPAL',
      },
    });

    expect((await agente.delete(`/api/v1/feriados/${feriado.id}`)).status).toBe(204);
    expect(await prisma.feriado.count()).toBe(0);
    const log = await prisma.logAuditoria.findFirst({ where: { acao: 'FERIADO_REMOVIDO' } });
    expect(log).toMatchObject({
      entidadeId: feriado.id,
      detalhes: { data: '2026-07-16', descricao: 'Aniversário' },
    });
  });

  it('responde 404 para feriado inexistente', async () => {
    const { agente } = await entrarComo();
    expect((await agente.delete('/api/v1/feriados/999999')).status).toBe(404);
    expect((await agente.delete('/api/v1/feriados/abc')).status).toBe(404);
  });
});

describe('POST /feriados/importar', () => {
  it('importa os feriados nacionais do ano', async () => {
    const { agente } = await entrarComo();
    const fetch = simularBrasilApi(NACIONAIS_2026);

    const resposta = await agente.post('/api/v1/feriados/importar').send({ ano: 2026 });
    expect(resposta.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      'https://brasilapi.com.br/api/feriados/v1/2026',
      expect.anything(),
    );
    expect(resposta.body.ignorados).toBe(0);
    expect(resposta.body.importados).toHaveLength(3);
    expect(resposta.body.importados[1]).toMatchObject({
      data: '2026-04-21',
      descricao: 'Tiradentes',
      abrangencia: 'NACIONAL',
    });

    const log = await prisma.logAuditoria.findFirst({ where: { acao: 'FERIADOS_IMPORTADOS' } });
    expect(log?.detalhes).toEqual({ ano: 2026, importados: 3, ignorados: 0 });
  });

  it('ignora datas repetidas e mantém o que já estava cadastrado', async () => {
    const { agente } = await entrarComo();
    await prisma.feriado.create({
      data: { data: paraDataBanco('2026-04-21'), descricao: 'Tiradentes', abrangencia: 'ESTADUAL' },
    });
    // A própria resposta repete uma data.
    simularBrasilApi([...NACIONAIS_2026, { date: '2026-12-25', name: 'Natal (de novo)' }]);

    const resposta = await agente.post('/api/v1/feriados/importar').send({ ano: 2026 });
    expect(resposta.status).toBe(200);
    expect(resposta.body.importados.map((f: { data: string }) => f.data)).toEqual([
      '2026-01-01',
      '2026-12-25',
    ]);
    expect(resposta.body.ignorados).toBe(1);
    expect(await prisma.feriado.count()).toBe(3);
    const mantido = await prisma.feriado.findUniqueOrThrow({
      where: { data: paraDataBanco('2026-04-21') },
    });
    expect(mantido.abrangencia).toBe('ESTADUAL');

    // Importar de novo não duplica nada.
    const denovo = await agente.post('/api/v1/feriados/importar').send({ ano: 2026 });
    expect(denovo.body).toEqual({ importados: [], ignorados: 3 });
  });

  it.each([
    ['fora do ar', new TypeError('fetch failed')],
    ['com erro HTTP', { message: 'erro' }, 500],
    ['com resposta inesperada', { feriados: 'nenhum' }],
  ])('falha da BrasilAPI (%s) não derruba nada', async (_caso, corpo, status?: number) => {
    const { agente } = await entrarComo();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    simularBrasilApi(corpo, status);

    const resposta = await agente.post('/api/v1/feriados/importar').send({ ano: 2026 });
    expect(resposta.status).toBe(502);
    expect(resposta.body.erro.codigo).toBe('BRASILAPI_INDISPONIVEL');
    expect(await prisma.feriado.count()).toBe(0);
    // O resto da API segue funcionando.
    expect((await agente.get('/api/v1/feriados?ano=2026')).status).toBe(200);
  });

  it('valida o ano', async () => {
    const { agente } = await entrarComo();
    const fetch = simularBrasilApi([]);
    const resposta = await agente.post('/api/v1/feriados/importar').send({ ano: 1800 });
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.mensagem).toBe('Informe um ano entre 1900 e 2199.');
    expect(fetch).not.toHaveBeenCalled();
  });
});
