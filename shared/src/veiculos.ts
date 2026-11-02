import { z } from 'zod';
import type { Turno } from './reservas';

/** Placa antiga (ABC1234) ou Mercosul (ABC1D23), em maiúsculas e sem hífen. */
export const PLACA_REGEX = /^[A-Z]{3}\d[A-Z\d]\d{2}$/;

export const MODELO_MAX = 80;

/** Aceita a placa digitada com hífen, espaço ou em minúsculas (abc-1234 → ABC1234). */
export function normalizarPlaca(placa: string): string {
  return placa.toUpperCase().replace(/[^A-Z\d]/g, '');
}

/** Cadastro e edição de veículo (RF05, RN09). Validado igual no formulário e na API. */
export const veiculoSchema = z.object({
  placa: z
    .string()
    .trim()
    .min(1, 'Informe a placa.')
    .transform(normalizarPlaca)
    .pipe(z.string().regex(PLACA_REGEX, 'Placa inválida. Use o formato ABC1234 ou ABC1D23.')),
  modelo: z
    .string()
    .trim()
    .min(1, 'Informe o modelo.')
    .max(MODELO_MAX, `O modelo pode ter no máximo ${MODELO_MAX} caracteres.`),
});

export type VeiculoEntrada = z.input<typeof veiculoSchema>;

/** Ativa ou desativa o veículo (RN10: desativado, nunca excluído). */
export const situacaoVeiculoSchema = z.object({
  ativo: z.boolean({ error: 'Informe se o veículo fica ativo.' }),
});

/** Veículo como a API devolve. `reservasFuturas` só vem para o administrador. */
export interface Veiculo {
  id: number;
  placa: string;
  modelo: string;
  ativo: boolean;
  reservasFuturas?: number;
}

/** Reserva futura de um veículo: o que a desativação vai cancelar (RN10). */
export interface ReservaAfetada {
  id: number;
  data: string;
  turno: Turno;
  destino: string;
  usuario: { id: number; nome: string };
}
