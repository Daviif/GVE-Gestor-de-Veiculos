// Datas da reserva são locais (America/Sao_Paulo) e sem hora. A coluna é @db.Date;
// no banco guardamos a meia-noite UTC do dia, e sempre trafegamos 'YYYY-MM-DD' na API.

import type { Prisma } from './generated/prisma/client';

/** RN02, RN03: a reserva é feita de 5 a 7 dias à frente. */
export const ANTECEDENCIA_MIN = 5;
export const ANTECEDENCIA_MAX = 7;

const FUSO = 'America/Sao_Paulo';

/** Data de hoje no fuso de São Paulo, como 'YYYY-MM-DD'. */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(agora);
}

/** 'YYYY-MM-DD' somado de `dias`, ainda como 'YYYY-MM-DD'. */
export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** As datas da janela de reserva (D+min a D+max), como 'YYYY-MM-DD'. */
export function janelaDeDatas(hoje: string = hojeEmSaoPaulo()): string[] {
  const datas: string[] = [];
  for (let d = ANTECEDENCIA_MIN; d <= ANTECEDENCIA_MAX; d++) datas.push(somarDias(hoje, d));
  return datas;
}

/** A data está dentro da janela permitida? */
export function dentroDaJanela(data: string, hoje: string = hojeEmSaoPaulo()): boolean {
  return janelaDeDatas(hoje).includes(data);
}

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
 */
export async function travarDatas(tx: Prisma.TransactionClient, datas: string[]): Promise<void> {
  for (const data of [...new Set(datas)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`data:${data}`}))`;
  }
}
