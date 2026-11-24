// Datas de reserva e feriado são só dia ('YYYY-MM-DD'), no fuso de Brasília (RNF05).
// Para exibir, o dia vira meia-noite UTC e é formatado em UTC: assim nunca "volta um dia"
// por causa do fuso do navegador.

import { hojeEmSaoPaulo, somarDias } from '@gve/shared';

// Implementação única no shared (a API usa as mesmas); reexportadas para as telas terem um
// só lugar de onde importar datas.
export { hojeEmSaoPaulo, somarDias };

const DIAS_DA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DIAS_DA_SEMANA_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function paraDate(data: string): Date {
  return new Date(`${data}T00:00:00.000Z`);
}

function formatar(data: string, opcoes: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('pt-BR', { ...opcoes, timeZone: 'UTC' }).format(paraDate(data));
}

/** Ano atual em São Paulo. */
export function anoAtual(agora: Date = new Date()): number {
  return Number(hojeEmSaoPaulo(agora).slice(0, 4));
}

/** Segunda-feira que começa a semana da data. */
export function inicioDaSemana(data: string): string {
  const diaSemana = (paraDate(data).getUTCDay() + 6) % 7; // dom=0 → 6, seg=1 → 0, …
  return somarDias(data, -diaSemana);
}

/** '2026-10-20' → '20/10'. */
export function diaMes(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/** '2026-10-20' → '20/10/2026'. */
export function dataCurta(data: string): string {
  return `${diaMes(data)}/${data.slice(0, 4)}`;
}

/** '2026-10-20' → 'ter., 20/10'. */
export function diaComSemana(data: string): string {
  return formatar(data, { weekday: 'short', day: '2-digit', month: '2-digit' });
}

/** '2026-10-20' → 'ter., 20/10/2026'. */
export function dataComSemana(data: string): string {
  return formatar(data, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** '2026-10-20' → '20 de outubro de 2026'. */
export function dataLonga(data: string): string {
  return formatar(data, { day: '2-digit', month: 'long', year: 'numeric' });
}

/** '2026-10-20' → 'Terça'. */
export function diaDaSemana(data: string): string {
  return DIAS_DA_SEMANA[paraDate(data).getUTCDay()]!;
}

/** '2026-10-20' → 'Ter'. */
export function diaSemanaCurto(data: string): string {
  return DIAS_DA_SEMANA_CURTOS[paraDate(data).getUTCDay()]!;
}

/** '2026-10-20' → '2026-10-01'. */
export function primeiroDoMes(data: string): string {
  return `${data.slice(0, 7)}-01`;
}

/** '2026-02-10' → '2026-02-28'. */
export function ultimoDoMes(data: string): string {
  const d = paraDate(data);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

/** '2026-10-20' → 'Outubro de 2026'. */
export function mesPorExtenso(data: string): string {
  const nome = formatar(data, { month: 'long', year: 'numeric' });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}
