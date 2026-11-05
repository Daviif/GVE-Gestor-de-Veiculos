import {
  AGENDA_JANELA_MAX_DIAS,
  agendaQuerySchema,
  type ReservaAgenda,
  type RespostaAgenda,
} from '@gve/shared';
import { Router } from 'express';
import { deDataBanco, paraDataBanco, somarDias } from '../datas';
import { prisma } from '../db';
import { autenticar } from '../middleware/autenticacao';
import { ErroApi } from '../middleware/erros';

export const rotasAgenda = Router();

rotasAgenda.use(autenticar());

/**
 * RF13: a agenda de uma janela de até 31 dias. Devolve as reservas ativas (com veículo e quem
 * reservou) e, para a grade desenhar também as células livres, os veículos e os feriados.
 */
rotasAgenda.get('/', async (req, res) => {
  const { inicio, fim } = agendaQuerySchema.parse(req.query);
  if (fim < inicio) {
    throw new ErroApi(400, 'INTERVALO_INVALIDO', 'A data final deve vir depois da inicial.');
  }
  // Janela limitada para não devolver muita coisa de uma vez (o front navega por semana).
  if (somarDias(inicio, AGENDA_JANELA_MAX_DIAS) <= fim) {
    throw new ErroApi(
      400,
      'JANELA_MUITO_LONGA',
      `A agenda devolve no máximo ${AGENDA_JANELA_MAX_DIAS} dias por consulta.`,
    );
  }

  const intervalo = { gte: paraDataBanco(inicio), lte: paraDataBanco(fim) };

  const [reservas, feriados] = await Promise.all([
    prisma.reserva.findMany({
      where: { status: 'ATIVA', data: intervalo },
      orderBy: [{ data: 'asc' }, { turno: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        data: true,
        turno: true,
        destino: true,
        veiculo: { select: { id: true, placa: true, modelo: true } },
        usuario: { select: { id: true, nome: true } },
      },
    }),
    prisma.feriado.findMany({
      where: { data: intervalo },
      orderBy: { data: 'asc' },
      select: { data: true, descricao: true },
    }),
  ]);

  // Linhas da grade: os veículos ativos e, para não perder reserva de carro já desativado
  // (semana passada, por exemplo), os que aparecem nas reservas da janela.
  const comReserva = [...new Set(reservas.map((r) => r.veiculo.id))];
  const veiculos = await prisma.veiculo.findMany({
    where: { OR: [{ ativo: true }, { id: { in: comReserva } }] },
    orderBy: [{ modelo: 'asc' }, { placa: 'asc' }],
    select: { id: true, placa: true, modelo: true },
  });

  const resposta: RespostaAgenda = {
    reservas: reservas.map((r): ReservaAgenda => ({
      id: r.id,
      data: deDataBanco(r.data),
      turno: r.turno,
      destino: r.destino,
      veiculo: r.veiculo,
      usuario: r.usuario,
    })),
    veiculos,
    feriados: feriados.map((f) => ({ data: deDataBanco(f.data), descricao: f.descricao })),
  };
  res.json(resposta);
});
