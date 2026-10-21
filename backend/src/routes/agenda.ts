import { AGENDA_JANELA_MAX_DIAS, agendaQuerySchema, type ReservaAgenda } from '@gve/shared';
import { Router } from 'express';
import { deDataBanco, paraDataBanco, somarDias } from '../datas';
import { prisma } from '../db';
import { autenticar } from '../middleware/autenticacao';
import { ErroApi } from '../middleware/erros';

export const rotasAgenda = Router();

rotasAgenda.use(autenticar());

/** RF13: as reservas ativas de uma janela de até 31 dias, com veículo e quem reservou. */
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

  const reservas = await prisma.reserva.findMany({
    where: {
      status: 'ATIVA',
      data: { gte: paraDataBanco(inicio), lte: paraDataBanco(fim) },
    },
    orderBy: [{ data: 'asc' }, { turno: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      data: true,
      turno: true,
      destino: true,
      veiculo: { select: { id: true, placa: true, modelo: true } },
      usuario: { select: { id: true, nome: true } },
    },
  });

  const resposta: ReservaAgenda[] = reservas.map((r) => ({
    id: r.id,
    data: deDataBanco(r.data),
    turno: r.turno,
    destino: r.destino,
    veiculo: r.veiculo,
    usuario: r.usuario,
  }));
  res.json({ reservas: resposta });
});
