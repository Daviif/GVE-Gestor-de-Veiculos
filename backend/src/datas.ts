// Datas da reserva são locais (America/Sao_Paulo) e sem hora. A coluna é @db.Date;
// no banco guardamos a meia-noite UTC do dia, e sempre trafegamos 'YYYY-MM-DD' na API.

import type { Prisma } from './generated/prisma/client';

// Dia de hoje, contas de data e janela de reserva têm implementação única no shared (a tela
// usa as mesmas); reexportadas aqui para as rotas terem um só lugar de onde importar datas.
export { dentroDaJanela, hojeEmSaoPaulo, janelaDeDatas, somarDias } from '@gve/shared';

/** Converte 'YYYY-MM-DD' para o Date que o Prisma grava na coluna @db.Date. */
export function paraDataBanco(data: string): Date {
  return new Date(`${data}T00:00:00.000Z`);
}

/** Converte a coluna @db.Date de volta para 'YYYY-MM-DD'. */
export function deDataBanco(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/**
 * Trava as datas ('YYYY-MM-DD') até o fim da transação. Reserva e cadastro de feriado passam
 * por aqui: uma reserva nunca entra num dia que acabou de virar feriado, e o feriado sempre
 * conta as reservas da data (RN11). Em ordem, para duas transações não se travarem em cruz.
 *
 * A reserva trava em modo compartilhado: reservas da mesma data não esperam umas pelas outras
 * (na abertura da janela todo mundo reserva o mesmo D+7), só pelo feriado, que trava em modo
 * exclusivo. A disputa pelo mesmo carro e turno fica com o índice único do banco (RNF09).
 */
export async function travarDatas(
  tx: Prisma.TransactionClient,
  datas: string[],
  modo: 'exclusivo' | 'compartilhado' = 'exclusivo',
): Promise<void> {
  for (const data of [...new Set(datas)].sort()) {
    const chave = `data:${data}`;
    if (modo === 'compartilhado') {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext(${chave}))`;
    } else {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chave}))`;
    }
  }
}
