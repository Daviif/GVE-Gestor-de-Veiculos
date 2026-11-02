import {
  cancelamentoSchema,
  disponibilidadeQuerySchema,
  novaReservaSchema,
  type Reserva,
  type VeiculoDisponivel,
} from '@gve/shared';
import { Router } from 'express';
import { z } from 'zod';
import {
  deDataBanco,
  dentroDaJanela,
  hojeEmSaoPaulo,
  janelaDeDatas,
  paraDataBanco,
  travarDatas,
} from '../datas';
import { prisma } from '../db';
import { Prisma } from '../generated/prisma/client';
import { autenticar } from '../middleware/autenticacao';
import { ErroApi } from '../middleware/erros';

export const rotasReservas = Router();

rotasReservas.use(autenticar());

/** Quais das datas informadas são feriado (RN11). */
async function feriadosEntre(datas: string[]): Promise<Set<string>> {
  const feriados = await prisma.feriado.findMany({
    where: { data: { in: datas.map(paraDataBanco) } },
    select: { data: true },
  });
  return new Set(feriados.map((f) => deDataBanco(f.data)));
}

function erroFeriado(): ErroApi {
  return new ErroApi(422, 'DATA_FERIADO', 'Não há reservas em feriados. Escolha outra data.');
}

/** Recusa a data que está fora da janela (RN02, RN03) ou é feriado (RN11). */
async function validarData(data: string): Promise<void> {
  if (!dentroDaJanela(data)) {
    throw new ErroApi(
      422,
      'DATA_FORA_DA_JANELA',
      'Escolha uma data entre 5 e 7 dias a partir de hoje.',
    );
  }
  if ((await feriadosEntre([data])).has(data)) {
    throw erroFeriado();
  }
}

/** Datas da janela (D+5 a D+7) que não são feriado. */
rotasReservas.get('/datas-permitidas', async (_req, res) => {
  const janela = janelaDeDatas();
  const feriados = await feriadosEntre(janela);
  res.json({ datas: janela.filter((d) => !feriados.has(d)) });
});

/** Veículos ativos e se estão ocupados na data/turno (RF07). */
rotasReservas.get('/disponibilidade', async (req, res) => {
  const { data, turno } = disponibilidadeQuerySchema.parse(req.query);
  await validarData(data);

  const [veiculos, ocupadas] = await Promise.all([
    prisma.veiculo.findMany({
      where: { ativo: true },
      orderBy: [{ modelo: 'asc' }, { placa: 'asc' }],
      select: { id: true, placa: true, modelo: true },
    }),
    prisma.reserva.findMany({
      where: { data: paraDataBanco(data), turno, status: 'ATIVA' },
      select: { veiculoId: true },
    }),
  ]);

  const ocupados = new Set(ocupadas.map((r) => r.veiculoId));
  const lista: VeiculoDisponivel[] = veiculos.map((v) => ({ ...v, ocupado: ocupados.has(v.id) }));
  res.json({ veiculos: lista });
});

/** Cria a reserva (RF06). 409 se o veículo já está ocupado; 422 se fere alguma regra. */
rotasReservas.post('/', async (req, res) => {
  const entrada = novaReservaSchema.parse(req.body);
  await validarData(entrada.data);

  const veiculo = await prisma.veiculo.findUnique({
    where: { id: entrada.veiculoId },
    select: { id: true, placa: true, modelo: true, ativo: true },
  });
  if (!veiculo || !veiculo.ativo) {
    throw new ErroApi(422, 'VEICULO_INDISPONIVEL', 'Veículo indisponível. Escolha outro.');
  }

  try {
    const reserva = await prisma.$transaction(async (tx) => {
      // O validarData acima pode ter visto a data antes de ela virar feriado: confere de novo
      // com a data travada, que o cadastro de feriado também trava (RN11).
      await travarDatas(tx, [entrada.data]);
      if (await tx.feriado.findUnique({ where: { data: paraDataBanco(entrada.data) } })) {
        throw erroFeriado();
      }
      // Mesma ideia para o veículo: se o administrador o desativou nesse meio-tempo, a
      // desativação (que trava a linha com FOR UPDATE e cancela as reservas futuras) termina
      // antes e esta reserva é recusada, em vez de ficar num carro desativado (RN10).
      const [situacao] = await tx.$queryRaw<{ ativo: boolean }[]>`
        SELECT ativo FROM veiculo WHERE id = ${veiculo.id} FOR SHARE`;
      if (!situacao?.ativo) {
        throw new ErroApi(422, 'VEICULO_INDISPONIVEL', 'Veículo indisponível. Escolha outro.');
      }
      const criada = await tx.reserva.create({
        data: {
          veiculoId: veiculo.id,
          usuarioId: req.usuario!.id,
          data: paraDataBanco(entrada.data),
          turno: entrada.turno,
          destino: entrada.destino,
        },
        select: { id: true, data: true, turno: true, destino: true, status: true },
      });
      await tx.logAuditoria.create({
        data: {
          acao: 'RESERVA_CRIADA',
          usuarioId: req.usuario!.id,
          entidade: 'reserva',
          entidadeId: criada.id,
          detalhes: {
            veiculoId: veiculo.id,
            data: entrada.data,
            turno: entrada.turno,
            destino: entrada.destino,
          },
          ip: req.ip,
        },
      });
      return criada;
    });

    const resposta: Reserva = {
      id: reserva.id,
      data: deDataBanco(reserva.data),
      turno: reserva.turno,
      destino: reserva.destino,
      status: reserva.status,
      veiculo: { id: veiculo.id, placa: veiculo.placa, modelo: veiculo.modelo },
    };
    res.status(201).json({ reserva: resposta });
  } catch (erro) {
    // O índice único parcial (uma reserva ATIVA por veículo/data/turno) garante o RN01.
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      throw new ErroApi(
        409,
        'CONFLITO_RESERVA',
        'Este veículo acabou de ser reservado nesse turno. Escolha outro.',
      );
    }
    throw erro;
  }
});

/** Converte a linha do banco (com join do veículo) para o shape público da API. */
function paraReservaPublica(r: {
  id: number;
  data: Date;
  turno: Reserva['turno'];
  destino: string;
  status: Reserva['status'];
  veiculo: { id: number; placa: string; modelo: string };
}): Reserva {
  return {
    id: r.id,
    data: deDataBanco(r.data),
    turno: r.turno,
    destino: r.destino,
    status: r.status,
    veiculo: r.veiculo,
  };
}

/** Reservas do usuário logado (RF10): as próximas vêm primeiro, depois o histórico. */
rotasReservas.get('/minhas', async (req, res) => {
  const reservas = await prisma.reserva.findMany({
    where: { usuarioId: req.usuario!.id },
    orderBy: [{ data: 'desc' }, { turno: 'asc' }],
    select: {
      id: true,
      data: true,
      turno: true,
      destino: true,
      status: true,
      veiculo: { select: { id: true, placa: true, modelo: true } },
    },
  });
  res.json({ reservas: reservas.map(paraReservaPublica) });
});

/**
 * Cancela a reserva (RF11, RF12, RN05). O autor cancela sem motivo; um administrador que
 * cancela a reserva de outro deve informar o motivo (fica na auditoria, RF15).
 */
rotasReservas.post('/:id/cancelar', async (req, res) => {
  const idParam = z.coerce.number().int().positive().safeParse(req.params.id);
  const reserva = idParam.success
    ? await prisma.reserva.findUnique({
        where: { id: idParam.data },
        select: {
          id: true,
          usuarioId: true,
          data: true,
          turno: true,
          destino: true,
          status: true,
          veiculo: { select: { id: true, placa: true, modelo: true } },
        },
      })
    : null;
  if (!reserva) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Reserva não encontrada.');

  const usuario = req.usuario!;
  const dono = reserva.usuarioId === usuario.id;
  const admin = usuario.perfil === 'ADMINISTRADOR';
  if (!dono && !admin) {
    throw new ErroApi(403, 'SEM_PERMISSAO', 'Você só pode cancelar as suas próprias reservas.');
  }

  if (reserva.status === 'CANCELADA') {
    throw new ErroApi(409, 'JA_CANCELADA', 'Esta reserva já foi cancelada.');
  }
  // Reserva passada não pode ser cancelada (RN05): só serve para o histórico.
  if (deDataBanco(reserva.data) < hojeEmSaoPaulo()) {
    throw new ErroApi(409, 'RESERVA_PASSADA', 'Não dá para cancelar uma reserva que já ocorreu.');
  }

  const entrada = cancelamentoSchema.parse(req.body ?? {});
  const motivo = entrada.motivo?.trim() || undefined;
  if (!dono && !motivo) {
    throw new ErroApi(
      400,
      'MOTIVO_OBRIGATORIO',
      'Informe o motivo para cancelar a reserva de outro usuário.',
    );
  }

  const atualizada = await prisma.$transaction(async (tx) => {
    const r = await tx.reserva.update({
      where: { id: reserva.id },
      data: {
        status: 'CANCELADA',
        canceladoEm: new Date(),
        canceladoPorId: usuario.id,
      },
      select: {
        id: true,
        data: true,
        turno: true,
        destino: true,
        status: true,
        veiculo: { select: { id: true, placa: true, modelo: true } },
      },
    });
    await tx.logAuditoria.create({
      data: {
        acao: 'RESERVA_CANCELADA',
        usuarioId: usuario.id,
        entidade: 'reserva',
        entidadeId: reserva.id,
        detalhes: {
          dono: reserva.usuarioId,
          veiculoId: reserva.veiculo.id,
          data: deDataBanco(reserva.data),
          turno: reserva.turno,
          ...(motivo ? { motivo } : {}),
        },
        ip: req.ip,
      },
    });
    return r;
  });

  res.json({ reserva: paraReservaPublica(atualizada) });
});
