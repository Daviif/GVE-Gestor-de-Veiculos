import { z } from 'zod';

/** Turnos de reserva (RN06). */
export const TURNOS = ['MATUTINO', 'VESPERTINO'] as const;
export type Turno = (typeof TURNOS)[number];

export const ROTULO_TURNO: Record<Turno, string> = {
  MATUTINO: 'Manhã',
  VESPERTINO: 'Tarde',
};

export const DESTINO_MAX = 200;

/** RN02, RN03: a reserva é feita de 5 a 7 dias à frente. A API valida; a agenda usa para
 *  mostrar "+ reservar" só nas células em que a reserva é permitida. */
export const ANTECEDENCIA_MIN = 5;
export const ANTECEDENCIA_MAX = 7;

/** 'YYYY-MM-DD' que existe no calendário (recusa 2026-02-31, que o Date viraria 03/03). */
export const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
  .refine(
    (data) => new Date(`${data}T00:00:00.000Z`).toISOString().startsWith(data),
    'Data inválida.',
  );

/** Nova reserva (RF06). Validado igual no formulário e na API. */
export const novaReservaSchema = z.object({
  data: dataSchema,
  turno: z.enum(TURNOS, { error: 'Selecione o turno.' }),
  veiculoId: z.coerce
    .number({ error: 'Selecione o veículo.' })
    .int()
    .positive('Selecione o veículo.'),
  destino: z
    .string()
    .trim()
    .min(1, 'Informe o destino.')
    .max(DESTINO_MAX, `O destino pode ter no máximo ${DESTINO_MAX} caracteres.`),
});

export type NovaReservaEntrada = z.input<typeof novaReservaSchema>;

/** Consulta de disponibilidade por data e turno (RF07). */
export const disponibilidadeQuerySchema = z.object({
  data: dataSchema,
  turno: z.enum(TURNOS, { error: 'Selecione o turno.' }),
});

/** Um veículo na tela de escolha: ocupado = já reservado naquela data/turno. */
export interface VeiculoDisponivel {
  id: number;
  placa: string;
  modelo: string;
  ocupado: boolean;
}

/** Reserva como a API devolve. */
export interface Reserva {
  id: number;
  data: string;
  turno: Turno;
  destino: string;
  status: 'ATIVA' | 'CANCELADA';
  veiculo: { id: number; placa: string; modelo: string };
}

export const MOTIVO_CANCELAMENTO_MAX = 200;

/**
 * Cancelamento (RF11, RF12). O motivo é obrigatório quando um administrador cancela a
 * reserva de outro usuário; o próprio autor cancela sem precisar explicar.
 */
export const cancelamentoSchema = z.object({
  motivo: z
    .string()
    .trim()
    .max(
      MOTIVO_CANCELAMENTO_MAX,
      `O motivo pode ter no máximo ${MOTIVO_CANCELAMENTO_MAX} caracteres.`,
    )
    .optional(),
});

export type CancelamentoEntrada = z.input<typeof cancelamentoSchema>;

/** RF13: a agenda devolve no máximo 31 dias (uma janela que cabe no mês). */
export const AGENDA_JANELA_MAX_DIAS = 31;

export const agendaQuerySchema = z.object({
  inicio: dataSchema,
  fim: dataSchema,
});

/** Item da agenda da frota: uma reserva ativa com o nome de quem reservou. */
export interface ReservaAgenda {
  id: number;
  data: string;
  turno: Turno;
  destino: string;
  veiculo: { id: number; placa: string; modelo: string };
  usuario: { id: number; nome: string };
}

/** Veículo que ganha linha na agenda (os ativos, mais os que têm reserva na janela). */
export interface VeiculoAgenda {
  id: number;
  placa: string;
  modelo: string;
}

/** Feriado da janela: a agenda mostra o dia fechado para reservas (RN11). */
export interface FeriadoAgenda {
  data: string;
  descricao: string;
}

/** Resposta de GET /agenda: tudo o que a grade precisa para desenhar também as células livres. */
export interface RespostaAgenda {
  reservas: ReservaAgenda[];
  veiculos: VeiculoAgenda[];
  feriados: FeriadoAgenda[];
}
