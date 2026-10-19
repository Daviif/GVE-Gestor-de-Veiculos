import { z } from 'zod';

/** Turnos de reserva (RN06). */
export const TURNOS = ['MATUTINO', 'VESPERTINO'] as const;
export type Turno = (typeof TURNOS)[number];

export const ROTULO_TURNO: Record<Turno, string> = {
  MATUTINO: 'Matutino',
  VESPERTINO: 'Vespertino',
};

export const DESTINO_MAX = 200;

const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');

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
