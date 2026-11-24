// Dia e fuso das regras de reserva. Implementação única: a API e as telas importam daqui,
// para nunca discordarem sobre o que é "hoje" (RNF05).

/** Fuso de todas as datas do sistema (RNF05). */
export const FUSO = 'America/Sao_Paulo';

/** 'YYYY-MM-DD' do dia atual em Brasília (não do UTC nem do fuso do navegador). */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(agora);
}

/** 'YYYY-MM-DD' deslocado em `dias` (positivos ou negativos), ainda como 'YYYY-MM-DD'. */
export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
