import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import { hojeEmSaoPaulo, paraDataBanco, somarDias } from '../src/datas';
import { prisma } from '../src/db';
import { gerarHashSenha } from '../src/seguranca/senha';

const app = criarApp();

const SENHA = 'senha-boa-123';
const HOJE = hojeEmSaoPaulo();

/** Cria o usuário e devolve um agente já logado. */
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
  await prisma.veiculo.deleteMany();
  await prisma.usuario.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /veiculos', () => {
  it('exige login', async () => {
    const resposta = await request(app).get('/api/v1/veiculos');
    expect(resposta.status).toBe(401);
  });

  it('o administrador vê todos; o servidor, só os ativos', async () => {
    await prisma.veiculo.createMany({
      data: [
        { placa: 'ABC1234', modelo: 'Fiat Argo' },
        { placa: 'XYZ9A87', modelo: 'Onix', ativo: false },
      ],
    });
    const { agente: admin } = await entrarComo('ADMINISTRADOR');
    const { agente: servidor } = await entrarComo('SERVIDOR');

    const todos = await admin.get('/api/v1/veiculos');
    expect(todos.body.veiculos.map((v: { placa: string }) => v.placa)).toEqual([
      'ABC1234',
      'XYZ9A87',
    ]);

    const ativos = await servidor.get('/api/v1/veiculos');
    expect(ativos.body.veiculos).toEqual([
      { id: expect.any(Number), placa: 'ABC1234', modelo: 'Fiat Argo', ativo: true },
    ]);
  });
});

describe('POST /veiculos', () => {
  it('cadastra com a placa normalizada e registra na auditoria', async () => {
    const { agente, usuario } = await entrarComo('ADMINISTRADOR');
    const resposta = await agente
      .post('/api/v1/veiculos')
      .send({ placa: 'abc-1d23', modelo: ' Volkswagen Polo ' });

    expect(resposta.status).toBe(201);
    expect(resposta.body.veiculo).toMatchObject({
      placa: 'ABC1D23',
      modelo: 'Volkswagen Polo',
      ativo: true,
    });
    const log = await prisma.logAuditoria.findFirst({ where: { acao: 'VEICULO_CRIADO' } });
    expect(log).toMatchObject({
      usuarioId: usuario.id,
      entidade: 'veiculo',
      entidadeId: resposta.body.veiculo.id,
    });
  });

  it('recusa placa repetida com 409', async () => {
    await prisma.veiculo.create({ data: { placa: 'ABC1234', modelo: 'Fiat Argo' } });
    const { agente } = await entrarComo('ADMINISTRADOR');
    const resposta = await agente.post('/api/v1/veiculos').send({ placa: 'ABC1234', modelo: 'X' });
    expect(resposta.status).toBe(409);
    expect(resposta.body.erro).toEqual({
      codigo: 'PLACA_DUPLICADA',
      mensagem: 'Já existe um veículo com essa placa.',
    });
  });

  it('recusa placa inválida com 400', async () => {
    const { agente } = await entrarComo('ADMINISTRADOR');
    const resposta = await agente.post('/api/v1/veiculos').send({ placa: '123', modelo: 'X' });
    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('servidor não cadastra', async () => {
    const { agente } = await entrarComo('SERVIDOR');
    const resposta = await agente
      .post('/api/v1/veiculos')
      .send({ placa: 'ABC1234', modelo: 'Fiat Argo' });
    expect(resposta.status).toBe(403);
    expect(await prisma.veiculo.count()).toBe(0);
  });
});

describe('PUT /veiculos/:id', () => {
  it('edita e guarda o antes e o depois na auditoria', async () => {
    const veiculo = await prisma.veiculo.create({ data: { placa: 'ABC1234', modelo: 'Argo' } });
    const { agente } = await entrarComo('ADMINISTRADOR');
    const resposta = await agente
      .put(`/api/v1/veiculos/${veiculo.id}`)
      .send({ placa: 'ABC1234', modelo: 'Fiat Argo Drive' });

    expect(resposta.status).toBe(200);
    expect(resposta.body.veiculo.modelo).toBe('Fiat Argo Drive');
    const log = await prisma.logAuditoria.findFirst({ where: { acao: 'VEICULO_EDITADO' } });
    expect(log?.detalhes).toEqual({
      antes: { placa: 'ABC1234', modelo: 'Argo' },
      depois: { placa: 'ABC1234', modelo: 'Fiat Argo Drive' },
    });
  });

  it('recusa trocar para a placa de outro veículo', async () => {
    await prisma.veiculo.create({ data: { placa: 'ABC1234', modelo: 'Argo' } });
    const outro = await prisma.veiculo.create({ data: { placa: 'XYZ9876', modelo: 'Onix' } });
    const { agente } = await entrarComo('ADMINISTRADOR');
    const resposta = await agente
      .put(`/api/v1/veiculos/${outro.id}`)
      .send({ placa: 'ABC1234', modelo: 'Onix' });
    expect(resposta.status).toBe(409);
  });

  it('responde 404 para veículo inexistente', async () => {
    const { agente } = await entrarComo('ADMINISTRADOR');
    const resposta = await agente
      .put('/api/v1/veiculos/999')
      .send({ placa: 'ABC1234', modelo: 'X' });
    expect(resposta.status).toBe(404);
    expect(resposta.body.erro.mensagem).toBe('Veículo não encontrado.');
  });
});

describe('PATCH /veiculos/:id/situacao', () => {
  it('desativa e reativa sem excluir, registrando cada mudança', async () => {
    const veiculo = await prisma.veiculo.create({ data: { placa: 'ABC1234', modelo: 'Argo' } });
    const { agente } = await entrarComo('ADMINISTRADOR');
    const url = `/api/v1/veiculos/${veiculo.id}/situacao`;

    const desativado = await agente.patch(url).send({ ativo: false });
    expect(desativado.status).toBe(200);
    expect(desativado.body.veiculo.ativo).toBe(false);

    // Repetir não gera outro registro.
    await agente.patch(url).send({ ativo: false }).expect(200);
    await agente.patch(url).send({ ativo: true }).expect(200);

    const acoes = await prisma.logAuditoria.findMany({
      where: { entidade: 'veiculo' },
      orderBy: { id: 'asc' },
      select: { acao: true },
    });
    expect(acoes.map((a) => a.acao)).toEqual(['VEICULO_DESATIVADO', 'VEICULO_ATIVADO']);
    expect(await prisma.veiculo.count()).toBe(1);
  });

  it('servidor não desativa', async () => {
    const veiculo = await prisma.veiculo.create({ data: { placa: 'ABC1234', modelo: 'Argo' } });
    const { agente } = await entrarComo('SERVIDOR');
    const resposta = await agente
      .patch(`/api/v1/veiculos/${veiculo.id}/situacao`)
      .send({ ativo: false });
    expect(resposta.status).toBe(403);
  });
});

/** Cenário de reservas: duas futuras e uma de hoje no veículo, uma passada, uma já cancelada e uma de outro veículo. */
async function montarReservas(servidorId: number, adminId: number) {
  const veiculo = await prisma.veiculo.create({ data: { placa: 'ABC1234', modelo: 'Argo' } });
  const outro = await prisma.veiculo.create({ data: { placa: 'XYZ9A87', modelo: 'Onix' } });
  const base = { usuarioId: servidorId, destino: 'Escola X' };
  const reserva = (veiculoId: number, dias: number, turno: 'MATUTINO' | 'VESPERTINO') =>
    prisma.reserva.create({
      data: { ...base, veiculoId, data: paraDataBanco(somarDias(HOJE, dias)), turno },
    });

  const futuras = [
    await reserva(veiculo.id, 5, 'MATUTINO'),
    await reserva(veiculo.id, 6, 'VESPERTINO'),
    await reserva(veiculo.id, 0, 'MATUTINO'),
  ];
  const passada = await reserva(veiculo.id, -3, 'MATUTINO');
  const jaCancelada = await prisma.reserva.create({
    data: {
      ...base,
      veiculoId: veiculo.id,
      data: paraDataBanco(somarDias(HOJE, 7)),
      turno: 'MATUTINO',
      status: 'CANCELADA',
      canceladoEm: new Date(),
      canceladoPorId: adminId,
    },
  });
  const doOutro = await reserva(outro.id, 5, 'MATUTINO');
  return { veiculo, outro, futuras, passada, jaCancelada, doOutro };
}

describe('desativar cancela as reservas futuras (RN10)', () => {
  it('lista as reservas que seriam canceladas: só as futuras e ativas do veículo', async () => {
    const { agente, usuario: admin } = await entrarComo('ADMINISTRADOR');
    const { usuario: servidor } = await entrarComo('SERVIDOR');
    const { veiculo } = await montarReservas(servidor.id, admin.id);

    const resposta = await agente.get(`/api/v1/veiculos/${veiculo.id}/reservas-futuras`);
    expect(resposta.status).toBe(200);
    expect(resposta.body.reservas).toHaveLength(3);
    // Em ordem: hoje, +5, +6 — com quem reservou e o destino, para o aviso ao administrador.
    expect(resposta.body.reservas.map((r: { data: string }) => r.data)).toEqual([
      HOJE,
      somarDias(HOJE, 5),
      somarDias(HOJE, 6),
    ]);
    expect(resposta.body.reservas[0]).toMatchObject({
      destino: 'Escola X',
      usuario: { id: servidor.id, nome: 'Ana Servidora' },
    });
  });

  it('só o administrador vê a lista', async () => {
    const veiculo = await prisma.veiculo.create({ data: { placa: 'ABC1234', modelo: 'Argo' } });
    const { agente } = await entrarComo('SERVIDOR');
    const resposta = await agente.get(`/api/v1/veiculos/${veiculo.id}/reservas-futuras`);
    expect(resposta.status).toBe(403);
  });

  it('cancela as futuras, preserva o resto e devolve o que cancelou', async () => {
    const { agente, usuario: admin } = await entrarComo('ADMINISTRADOR');
    const { usuario: servidor } = await entrarComo('SERVIDOR');
    const { veiculo, futuras, passada, jaCancelada, doOutro } = await montarReservas(
      servidor.id,
      admin.id,
    );

    const resposta = await agente
      .patch(`/api/v1/veiculos/${veiculo.id}/situacao`)
      .send({ ativo: false });
    expect(resposta.status).toBe(200);
    expect(resposta.body.veiculo).toMatchObject({ ativo: false, reservasFuturas: 0 });
    expect(resposta.body.reservasCanceladas).toHaveLength(3);

    const situacao = async (id: number) =>
      prisma.reserva.findUniqueOrThrow({
        where: { id },
        select: { status: true, canceladoPorId: true, canceladoEm: true },
      });
    for (const r of futuras) {
      expect(await situacao(r.id)).toMatchObject({ status: 'CANCELADA', canceladoPorId: admin.id });
      expect((await situacao(r.id)).canceladoEm).not.toBeNull();
    }
    // A passada continua ativa (histórico), a já cancelada não muda e a do outro carro fica.
    expect((await situacao(passada.id)).status).toBe('ATIVA');
    expect((await situacao(doOutro.id)).status).toBe('ATIVA');
    expect(await situacao(jaCancelada.id)).toMatchObject({ canceladoPorId: admin.id });
  });

  it('registra cada cancelamento e a desativação na auditoria', async () => {
    const { agente, usuario: admin } = await entrarComo('ADMINISTRADOR');
    const { usuario: servidor } = await entrarComo('SERVIDOR');
    const { veiculo } = await montarReservas(servidor.id, admin.id);

    await agente
      .patch(`/api/v1/veiculos/${veiculo.id}/situacao`)
      .send({ ativo: false })
      .expect(200);

    const cancelamentos = await prisma.logAuditoria.findMany({
      where: { acao: 'RESERVA_CANCELADA' },
    });
    expect(cancelamentos).toHaveLength(3);
    expect(cancelamentos[0]).toMatchObject({ usuarioId: admin.id, entidade: 'reserva' });
    expect(cancelamentos[0]!.detalhes).toMatchObject({
      dono: servidor.id,
      veiculoId: veiculo.id,
      motivo: 'Veículo desativado',
    });
    const desativacao = await prisma.logAuditoria.findFirstOrThrow({
      where: { acao: 'VEICULO_DESATIVADO' },
    });
    expect(desativacao.detalhes).toEqual({ placa: 'ABC1234', reservasCanceladas: 3 });
  });

  it('desativar duas vezes cancela uma vez só', async () => {
    const { agente, usuario: admin } = await entrarComo('ADMINISTRADOR');
    const { usuario: servidor } = await entrarComo('SERVIDOR');
    const { veiculo } = await montarReservas(servidor.id, admin.id);
    const url = `/api/v1/veiculos/${veiculo.id}/situacao`;

    await agente.patch(url).send({ ativo: false }).expect(200);
    const repetida = await agente.patch(url).send({ ativo: false });
    expect(repetida.status).toBe(200);
    expect(repetida.body.reservasCanceladas).toEqual([]);
    expect(await prisma.logAuditoria.count({ where: { acao: 'RESERVA_CANCELADA' } })).toBe(3);
  });

  it('reativar não traz as reservas canceladas de volta', async () => {
    const { agente, usuario: admin } = await entrarComo('ADMINISTRADOR');
    const { usuario: servidor } = await entrarComo('SERVIDOR');
    const { veiculo } = await montarReservas(servidor.id, admin.id);
    const url = `/api/v1/veiculos/${veiculo.id}/situacao`;

    await agente.patch(url).send({ ativo: false }).expect(200);
    const resposta = await agente.patch(url).send({ ativo: true });
    expect(resposta.body.veiculo).toMatchObject({ ativo: true, reservasFuturas: 0 });
    expect(resposta.body.reservasCanceladas).toEqual([]);
  });

  it('depois de desativado, o carro não aceita reserva nova', async () => {
    const { agente: admin } = await entrarComo('ADMINISTRADOR');
    const { agente: servidor } = await entrarComo('SERVIDOR');
    const veiculo = await prisma.veiculo.create({ data: { placa: 'ABC1234', modelo: 'Argo' } });
    await admin.patch(`/api/v1/veiculos/${veiculo.id}/situacao`).send({ ativo: false }).expect(200);

    const resposta = await servidor.post('/api/v1/reservas').send({
      data: somarDias(HOJE, 5),
      turno: 'MATUTINO',
      veiculoId: veiculo.id,
      destino: 'Escola X',
    });
    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('VEICULO_INDISPONIVEL');
  });
});

describe('GET /veiculos: reservas futuras por veículo', () => {
  it('o administrador recebe a contagem; o servidor não', async () => {
    const { agente: admin, usuario: adminUsuario } = await entrarComo('ADMINISTRADOR');
    const { agente: servidor, usuario: servidorUsuario } = await entrarComo('SERVIDOR');
    await montarReservas(servidorUsuario.id, adminUsuario.id);

    const doAdmin = await admin.get('/api/v1/veiculos');
    const argo = doAdmin.body.veiculos.find((v: { placa: string }) => v.placa === 'ABC1234');
    // Hoje, +5 e +6: a passada e a cancelada não contam.
    expect(argo.reservasFuturas).toBe(3);

    const doServidor = await servidor.get('/api/v1/veiculos');
    expect(doServidor.body.veiculos[0]).not.toHaveProperty('reservasFuturas');
  });
});
