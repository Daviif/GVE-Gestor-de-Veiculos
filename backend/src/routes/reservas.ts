import {
  disponibilidadeQuerySchema,
  novaReservaSchema,
  type Reserva,
  type VeiculoDisponivel,
} from '@gve/shared';
import { Router } from 'express';
import { deDataBanco, dentroDaJanela, janelaDeDatas, paraDataBanco } from '../datas';
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
    throw new ErroApi(422, 'DATA_FERIADO', 'Não há reservas em feriados. Escolha outra data.');
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
