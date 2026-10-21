import {
  DESCRICAO_FERIADO_MAX,
  feriadoSchema,
  feriadosQuerySchema,
  importarFeriadosSchema,
  type Feriado,
} from '@gve/shared';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { deDataBanco, hojeEmSaoPaulo, paraDataBanco, travarDatas } from '../datas';
import { prisma } from '../db';
import { Prisma } from '../generated/prisma/client';
import { autenticar, exigirPerfil } from '../middleware/autenticacao';
import { ErroApi } from '../middleware/erros';

/** Sem resposta da BrasilAPI nesse prazo, a importação desiste (o resto do sistema segue). */
export const BRASILAPI_TIMEOUT_MS = 10_000;

const respostaBrasilApi = z.array(z.object({ date: z.string(), name: z.string() }));

export const rotasFeriados = Router();

// Cadastro de feriados é exclusivo do administrador (RF17).
rotasFeriados.use(autenticar(), exigirPerfil('ADMINISTRADOR'));

/** Quantas reservas ativas cada data tem; o RN11 pede aviso ao cadastrar feriado nelas. */
async function reservasAtivasPorData(
  datas: Date[],
  db: Prisma.TransactionClient,
): Promise<Map<string, number>> {
  if (datas.length === 0) return new Map();
  const grupos = await db.reserva.groupBy({
    by: ['data'],
    where: { data: { in: datas }, status: 'ATIVA' },
    _count: { _all: true },
  });
  return new Map(grupos.map((g) => [deDataBanco(g.data), g._count._all]));
}

const campos = { id: true, data: true, descricao: true, abrangencia: true } as const;
type FeriadoBanco = Prisma.FeriadoGetPayload<{ select: typeof campos }>;

/** Com `db` = a transação que travou as datas, a contagem de reservas não deixa nenhuma escapar. */
async function paraResposta(
  feriados: FeriadoBanco[],
  db: Prisma.TransactionClient = prisma,
): Promise<Feriado[]> {
  const reservas = await reservasAtivasPorData(
    feriados.map((f) => f.data),
    db,
  );
  return feriados.map((f) => {
    const data = deDataBanco(f.data);
    return { ...f, data, reservasAtivas: reservas.get(data) ?? 0 };
  });
}

/** Feriados de um ano (o atual, se não informado), em ordem de data. */
rotasFeriados.get('/', async (req, res) => {
  const { ano } = feriadosQuerySchema.parse({ ano: req.query.ano ?? hojeEmSaoPaulo().slice(0, 4) });
  const feriados = await prisma.feriado.findMany({
    where: { data: { gte: paraDataBanco(`${ano}-01-01`), lte: paraDataBanco(`${ano}-12-31`) } },
    orderBy: { data: 'asc' },
    select: campos,
  });
  res.json({ feriados: await paraResposta(feriados) });
});

rotasFeriados.post('/', async (req, res) => {
  const entrada = feriadoSchema.parse(req.body);
  const data = paraDataBanco(entrada.data);

  try {
    const feriado = await prisma.$transaction(async (tx) => {
      // Espera reservas em andamento nesta data: elas entram na contagem do aviso (RN11).
      await travarDatas(tx, [entrada.data]);
      if (await tx.feriado.findUnique({ where: { data }, select: { id: true } })) {
        throw new ErroApi(409, 'FERIADO_DUPLICADO', 'Já existe um feriado nessa data.', 'data');
      }
      const criado = await tx.feriado.create({
        data: { ...entrada, data, criadoPorId: req.usuario!.id },
        select: campos,
      });
      await tx.logAuditoria.create({
        data: {
          acao: 'FERIADO_CRIADO',
          usuarioId: req.usuario!.id,
          entidade: 'feriado',
          entidadeId: criado.id,
          detalhes: { data: entrada.data, descricao: entrada.descricao },
          ip: req.ip,
        },
      });
      const [resposta] = await paraResposta([criado], tx);
      return resposta;
    });
    res.status(201).json({ feriado });
  } catch (erro) {
    // Dois cadastros simultâneos na mesma data: o índice único do banco decide.
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      throw new ErroApi(409, 'FERIADO_DUPLICADO', 'Já existe um feriado nessa data.', 'data');
    }
    throw erro;
  }
});

rotasFeriados.delete('/:id', async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const feriado = id.success
    ? await prisma.feriado.findUnique({ where: { id: id.data }, select: campos })
    : null;
  if (!feriado) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Feriado não encontrado.');

  await prisma.$transaction([
    // deleteMany: se outro administrador acabou de remover, não é erro.
    prisma.feriado.deleteMany({ where: { id: feriado.id } }),
    prisma.logAuditoria.create({
      data: {
        acao: 'FERIADO_REMOVIDO',
        usuarioId: req.usuario!.id,
        entidade: 'feriado',
        entidadeId: feriado.id,
        detalhes: { data: deDataBanco(feriado.data), descricao: feriado.descricao },
        ip: req.ip,
      },
    }),
  ]);
  res.status(204).end();
});

/** Busca os feriados nacionais do ano na BrasilAPI. Qualquer falha vira 502, nunca 500. */
async function buscarFeriadosNacionais(ano: number) {
  try {
    const resposta = await fetch(`${config.BRASILAPI_URL}/feriados/v1/${ano}`, {
      signal: AbortSignal.timeout(BRASILAPI_TIMEOUT_MS),
    });
    if (!resposta.ok) throw new Error(`BrasilAPI respondeu ${resposta.status}`);
    return respostaBrasilApi.parse(await resposta.json());
  } catch (erro) {
    console.error('Falha ao consultar a BrasilAPI:', erro);
    throw new ErroApi(
      502,
      'BRASILAPI_INDISPONIVEL',
      'Não foi possível consultar os feriados nacionais agora. Tente mais tarde ou cadastre manualmente.',
    );
  }
}

/** Importa os feriados nacionais do ano (RF17). Datas já cadastradas são mantidas como estão. */
rotasFeriados.post('/importar', async (req, res) => {
  const { ano } = importarFeriadosSchema.parse(req.body);
  const nacionais = await buscarFeriadosNacionais(ano);

  // A BrasilAPI pode repetir uma data (ex.: dois nomes no mesmo dia): fica o primeiro.
  const porData = new Map<string, string>();
  for (const { date, name } of nacionais) {
    const data = date.slice(0, 10);
    if (data.startsWith(`${ano}-`) && !porData.has(data)) porData.set(data, name);
  }

  const importados = await prisma.$transaction(async (tx) => {
    await travarDatas(tx, [...porData.keys()]);
    const criados = await tx.feriado.createManyAndReturn({
      data: [...porData].map(([data, descricao]) => ({
        data: paraDataBanco(data),
        descricao: descricao.slice(0, DESCRICAO_FERIADO_MAX),
        abrangencia: 'NACIONAL' as const,
        criadoPorId: req.usuario!.id,
      })),
      skipDuplicates: true,
      select: campos,
    });
    await tx.logAuditoria.create({
      data: {
        acao: 'FERIADOS_IMPORTADOS',
        usuarioId: req.usuario!.id,
        entidade: 'feriado',
        detalhes: {
          ano,
          importados: criados.length,
          ignorados: porData.size - criados.length,
        },
        ip: req.ip,
      },
    });
    return paraResposta(
      criados.sort((x, y) => x.data.getTime() - y.data.getTime()),
      tx,
    );
  });

  res.json({ importados, ignorados: porData.size - importados.length });
});
