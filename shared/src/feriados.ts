import { z } from 'zod';
import { dataSchema } from './reservas';

/** Abrangência do feriado (RF17). */
export const ABRANGENCIAS = ['NACIONAL', 'ESTADUAL', 'MUNICIPAL'] as const;
export type Abrangencia = (typeof ABRANGENCIAS)[number];

export const ROTULO_ABRANGENCIA: Record<Abrangencia, string> = {
  NACIONAL: 'Nacional',
  ESTADUAL: 'Estadual',
  MUNICIPAL: 'Municipal',
};

export const DESCRICAO_FERIADO_MAX = 120;

/** Anos que a BrasilAPI aceita na consulta de feriados. */
export const ANO_MIN = 1900;
export const ANO_MAX = 2199;

const anoSchema = z.coerce
  .number({ error: 'Informe o ano.' })
  .int('Ano inválido.')
  .min(ANO_MIN, `Informe um ano entre ${ANO_MIN} e ${ANO_MAX}.`)
  .max(ANO_MAX, `Informe um ano entre ${ANO_MIN} e ${ANO_MAX}.`);

/** Cadastro de feriado (RF17). Validado igual no formulário e na API. */
export const feriadoSchema = z.object({
  data: z.string({ error: 'Informe a data.' }).min(1, 'Informe a data.').pipe(dataSchema),
  descricao: z
    .string()
    .trim()
    .min(1, 'Informe o nome do feriado.')
    .max(DESCRICAO_FERIADO_MAX, `O nome pode ter no máximo ${DESCRICAO_FERIADO_MAX} caracteres.`),
  abrangencia: z.enum(ABRANGENCIAS, { error: 'Selecione a abrangência.' }),
});

export type FeriadoEntrada = z.input<typeof feriadoSchema>;

/** Lista de feriados de um ano. */
export const feriadosQuerySchema = z.object({ ano: anoSchema });

/** Importação dos feriados nacionais da BrasilAPI. */
export const importarFeriadosSchema = z.object({ ano: anoSchema });

/** Feriado como a API devolve. reservasAtivas > 0 pede o aviso do RN11. */
export interface Feriado {
  id: number;
  data: string;
  descricao: string;
  abrangencia: Abrangencia;
  reservasAtivas: number;
}
