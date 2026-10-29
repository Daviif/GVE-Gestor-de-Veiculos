import {
  situacaoVeiculoSchema,
  veiculoSchema,
  type ReservaAfetada,
  type Veiculo,
} from '@gve/shared';
import { Router } from 'express';
import { z } from 'zod';
import { deDataBanco, hojeEmSaoPaulo, paraDataBanco } from '../datas';
import { prisma } from '../db';
import { Prisma } from '../generated/prisma/client';
import { autenticar, exigirPerfil } from '../middleware/autenticacao';
import { ErroApi } from '../middleware/erros';

const PLACA_DUPLICADA = 'Já existe um veículo com essa placa.';

const campos = { id: true, placa: true, modelo: true, ativo: true } as const;

export const rotasVeiculos = Router();

rotasVeiculos.use(autenticar());

/** Busca o veículo do :id da rota ou responde 404. */
async function buscarVeiculo(idParam: unknown): Promise<Veiculo> {
  const id = z.coerce.number().int().positive().safeParse(idParam);
  const veiculo = id.success
    ? await prisma.veiculo.findUnique({ where: { id: id.data }, select: campos })
    : null;
  if (!veiculo) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Veículo não encontrado.');
  return veiculo;
}

/** A placa é única (RN09); o banco garante e aqui vira uma mensagem para o usuário. */
function placaDuplicada(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';
}

/** Reservas que ainda não aconteceram: ativas, de hoje em diante (RN05). */
function reservasFuturas() {
  return { status: 'ATIVA', data: { gte: paraDataBanco(hojeEmSaoPaulo()) } } as const;
}

const camposReservaAfetada = {
  id: true,
  data: true,
  turno: true,
  destino: true,
  usuario: { select: { id: true, nome: true } },
} as const;

function paraReservaAfetada(r: {
  id: number;
  data: Date;
  turno: ReservaAfetada['turno'];
  destino: string;
  usuario: { id: number; nome: string };
}): ReservaAfetada {
  return {
    id: r.id,
    data: deDataBanco(r.data),
    turno: r.turno,
    destino: r.destino,
    usuario: r.usuario,
  };
}

/** O administrador vê a frota toda (com as reservas futuras de cada carro); o servidor, só os ativos. */
rotasVeiculos.get('/', async (req, res) => {
  const admin = req.usuario!.perfil === 'ADMINISTRADOR';
  const veiculos = await prisma.veiculo.findMany({
    where: admin ? {} : { ativo: true },
    orderBy: [{ ativo: 'desc' }, { modelo: 'asc' }, { placa: 'asc' }],
    select: {
      ...campos,
      _count: { select: { reservas: { where: reservasFuturas() } } },
    },
  });
  res.json({
    veiculos: veiculos.map(({ _count, ...v }): Veiculo => {
      return admin ? { ...v, reservasFuturas: _count.reservas } : v;
    }),
  });
});

rotasVeiculos.post('/', exigirPerfil('ADMINISTRADOR'), async (req, res) => {
  const entrada = veiculoSchema.parse(req.body);

  try {
    const veiculo = await prisma.$transaction(async (tx) => {
      const criado = await tx.veiculo.create({ data: entrada, select: campos });
      await tx.logAuditoria.create({
        data: {
          acao: 'VEICULO_CRIADO',
          usuarioId: req.usuario!.id,
          entidade: 'veiculo',
          entidadeId: criado.id,
          detalhes: entrada,
          ip: req.ip,
        },
      });
      return criado;
    });
    res.status(201).json({ veiculo: { ...veiculo, reservasFuturas: 0 } });
  } catch (erro) {
    if (placaDuplicada(erro)) throw new ErroApi(409, 'PLACA_DUPLICADA', PLACA_DUPLICADA);
    throw erro;
  }
});

rotasVeiculos.put('/:id', exigirPerfil('ADMINISTRADOR'), async (req, res) => {
  const anterior = await buscarVeiculo(req.params.id);
  const entrada = veiculoSchema.parse(req.body);

  try {
    const veiculo = await prisma.$transaction(async (tx) => {
      const editado = await tx.veiculo.update({
        where: { id: anterior.id },
        data: entrada,
        select: campos,
      });
      await tx.logAuditoria.create({
        data: {
          acao: 'VEICULO_EDITADO',
          usuarioId: req.usuario!.id,
          entidade: 'veiculo',
          entidadeId: anterior.id,
          detalhes: { antes: { placa: anterior.placa, modelo: anterior.modelo }, depois: entrada },
          ip: req.ip,
        },
      });
      return editado;
    });
    res.json({ veiculo });
  } catch (erro) {
    if (placaDuplicada(erro)) throw new ErroApi(409, 'PLACA_DUPLICADA', PLACA_DUPLICADA);
    throw erro;
  }
});

/** O que a desativação vai cancelar: as reservas futuras do veículo, para o admin confirmar (RN10). */
rotasVeiculos.get('/:id/reservas-futuras', exigirPerfil('ADMINISTRADOR'), async (req, res) => {
  const veiculo = await buscarVeiculo(req.params.id);
  const reservas = await prisma.reserva.findMany({
    where: { veiculoId: veiculo.id, ...reservasFuturas() },
    orderBy: [{ data: 'asc' }, { turno: 'asc' }],
    select: camposReservaAfetada,
  });
  res.json({ reservas: reservas.map(paraReservaAfetada) });
});

/**
 * Desativa ou reativa (RN10). Desativar cancela as reservas futuras do veículo, tudo numa
 * transação, e cada cancelamento fica na auditoria. O veículo sai da lista de reserva, mas
 * continua no histórico. Reativar não traz as reservas de volta.
 */
rotasVeiculos.patch('/:id/situacao', exigirPerfil('ADMINISTRADOR'), async (req, res) => {
  const atual = await buscarVeiculo(req.params.id);
  const { ativo } = situacaoVeiculoSchema.parse(req.body);
  const admin = req.usuario!;

  const resultado = await prisma.$transaction(async (tx) => {
    // Trava a linha do veículo. A criação de reserva confere "ativo" com FOR SHARE na própria
    // transação, então uma reserva nova espera esta terminar e enxerga o veículo desativado:
    // nenhuma reserva futura escapa do cancelamento.
    await tx.$queryRaw`SELECT id FROM veiculo WHERE id = ${atual.id} FOR UPDATE`;
    const veiculo = await tx.veiculo.findUniqueOrThrow({ where: { id: atual.id }, select: campos });
    if (veiculo.ativo === ativo) return { veiculo, canceladas: [] as ReservaAfetada[] };

    let canceladas: ReservaAfetada[] = [];
    if (!ativo) {
      const futuras = await tx.reserva.findMany({
        where: { veiculoId: atual.id, ...reservasFuturas() },
        orderBy: [{ data: 'asc' }, { turno: 'asc' }],
        select: camposReservaAfetada,
      });
      canceladas = futuras.map(paraReservaAfetada);
      if (futuras.length > 0) {
        await tx.reserva.updateMany({
          where: { id: { in: futuras.map((r) => r.id) } },
          data: { status: 'CANCELADA', canceladoEm: new Date(), canceladoPorId: admin.id },
        });
        await tx.logAuditoria.createMany({
          data: canceladas.map((r) => ({
            acao: 'RESERVA_CANCELADA' as const,
            usuarioId: admin.id,
            entidade: 'reserva',
            entidadeId: r.id,
            detalhes: {
              dono: r.usuario.id,
              veiculoId: atual.id,
              data: r.data,
              turno: r.turno,
              motivo: 'Veículo desativado',
            },
            ip: req.ip,
          })),
        });
      }
    }

    const atualizado = await tx.veiculo.update({
      where: { id: atual.id },
      data: { ativo },
      select: campos,
    });
    await tx.logAuditoria.create({
      data: {
        acao: ativo ? 'VEICULO_ATIVADO' : 'VEICULO_DESATIVADO',
        usuarioId: admin.id,
        entidade: 'veiculo',
        entidadeId: atual.id,
        detalhes: { placa: atual.placa, reservasCanceladas: canceladas.length },
        ip: req.ip,
      },
    });
    return { veiculo: atualizado, canceladas };
  });

  const restantes = await prisma.reserva.count({
    where: { veiculoId: atual.id, ...reservasFuturas() },
  });
  res.json({
    veiculo: { ...resultado.veiculo, reservasFuturas: restantes },
    reservasCanceladas: resultado.canceladas,
  });
});
