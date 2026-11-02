import {
  historicoQuerySchema,
  type ItemHistorico,
  type RespostaHistorico,
  type SituacaoHistorico,
} from '@gve/shared';
import { Router } from 'express';
import { deDataBanco, hojeEmSaoPaulo, paraDataBanco, somarDias } from '../datas';
import { prisma } from '../db';
import type { Prisma } from '../generated/prisma/client';
import { autenticar, exigirPerfil } from '../middleware/autenticacao';
import { ErroApi } from '../middleware/erros';

export const rotasHistorico = Router();

// Histórico das reservas (RF16): só o administrador consulta.
rotasHistorico.use(autenticar(), exigirPerfil('ADMINISTRADOR'));

/**
 * Veículos para popular o filtro do histórico. Inclui os inativos (podem ter
 * reservas antigas que o admin ainda queira filtrar) e independe da regra de
 * disponibilidade por data/turno — por isso vive aqui, e não em `/reservas`.
 */
rotasHistorico.get('/veiculos', async (_req, res) => {
  const veiculos = await prisma.veiculo.findMany({
    orderBy: [{ ativo: 'desc' }, { modelo: 'asc' }, { placa: 'asc' }],
    select: { id: true, placa: true, modelo: true, ativo: true },
  });
  res.json({ veiculos });
});

function montarFiltro(q: ReturnType<typeof historicoQuerySchema.parse>): Prisma.ReservaWhereInput {
  const where: Prisma.ReservaWhereInput = {};
  if (q.inicio || q.fim) {
    const data: Prisma.DateTimeFilter = {};
    if (q.inicio) data.gte = paraDataBanco(q.inicio);
    // Período inclusivo nos dois lados: < início do dia seguinte ao `fim`.
    if (q.fim) data.lt = paraDataBanco(somarDias(q.fim, 1));
    where.data = data;
  }
  if (q.usuarioId !== undefined) where.usuarioId = q.usuarioId;
  if (q.veiculoId !== undefined) where.veiculoId = q.veiculoId;
  return where;
}

/** Deriva o status mostrado no histórico combinando status real e data. */
function situacaoDe(status: 'ATIVA' | 'CANCELADA', data: string, hoje: string): SituacaoHistorico {
  if (status === 'CANCELADA') return 'CANCELADA';
  return data < hoje ? 'CONCLUIDA' : 'AGENDADA';
}

/** Lista o histórico de reservas (RF16), com filtros e paginação. */
rotasHistorico.get('/', async (req, res) => {
  const q = historicoQuerySchema.parse(req.query);
  if (q.inicio && q.fim && q.fim < q.inicio) {
    throw new ErroApi(400, 'INTERVALO_INVALIDO', 'A data final deve vir depois da inicial.');
  }
  const where = montarFiltro(q);
  const hoje = hojeEmSaoPaulo();

  const [reservas, total] = await Promise.all([
    prisma.reserva.findMany({
      where,
      orderBy: [{ data: 'desc' }, { turno: 'asc' }, { id: 'desc' }],
      skip: (q.pagina - 1) * q.tamanho,
      take: q.tamanho,
      select: {
        id: true,
        data: true,
        turno: true,
        destino: true,
        status: true,
        canceladoEm: true,
        veiculo: { select: { id: true, placa: true, modelo: true } },
        usuario: { select: { id: true, nome: true } },
      },
    }),
    prisma.reserva.count({ where }),
  ]);

  const itens: ItemHistorico[] = reservas.map((r) => {
    const data = deDataBanco(r.data);
    return {
      id: r.id,
      data,
      turno: r.turno,
      destino: r.destino,
      situacao: situacaoDe(r.status, data, hoje),
      canceladoEm: r.canceladoEm ? r.canceladoEm.toISOString() : null,
      veiculo: r.veiculo,
      usuario: r.usuario,
    };
  });

  const resposta: RespostaHistorico = { itens, pagina: q.pagina, tamanho: q.tamanho, total };
  res.json(resposta);
});
