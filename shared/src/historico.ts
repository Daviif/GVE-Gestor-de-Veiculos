import { z } from 'zod';
import { dataSchema, TURNOS, type Turno } from './reservas';

export const HISTORICO_TAMANHO_PADRAO = 25;
export const HISTORICO_TAMANHO_MAX = 100;

/** RF16: consulta do histórico de reservas com filtros e paginação. */
export const historicoQuerySchema = z.object({
  inicio: dataSchema.optional(),
  fim: dataSchema.optional(),
  usuarioId: z.coerce.number().int().positive().optional(),
  veiculoId: z.coerce.number().int().positive().optional(),
  pagina: z.coerce.number().int().positive().default(1),
  tamanho: z.coerce
    .number()
    .int()
    .positive()
    .max(HISTORICO_TAMANHO_MAX)
    .default(HISTORICO_TAMANHO_PADRAO),
});

export type HistoricoQuery = z.input<typeof historicoQuerySchema>;

/** Situação derivada mostrada no histórico (depende do status + data da reserva). */
export type SituacaoHistorico = 'AGENDADA' | 'CONCLUIDA' | 'CANCELADA';

/** Uma linha do histórico: a reserva com quem reservou e situação derivada. */
export interface ItemHistorico {
  id: number;
  data: string;
  turno: Turno;
  destino: string;
  situacao: SituacaoHistorico;
  canceladoEm: string | null;
  veiculo: { id: number; placa: string; modelo: string };
  usuario: { id: number; nome: string };
}

/** Resposta paginada. */
export interface RespostaHistorico {
  itens: ItemHistorico[];
  pagina: number;
  tamanho: number;
  total: number;
}

/** Veículo listado para o filtro (inclui inativos, para filtrar reservas antigas). */
export interface VeiculoHistorico {
  id: number;
  placa: string;
  modelo: string;
  ativo: boolean;
}

export { TURNOS };
export type { Turno };
