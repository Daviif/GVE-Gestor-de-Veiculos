import { z } from 'zod';

/**
 * Maior valor de uma coluna Int (int4) do Postgres. Um id acima disso nem chega a ser
 * procurado: o Prisma falha ao converter e a requisição viraria erro 500 em vez de 404.
 */
export const ID_MAX = 2_147_483_647;

/** Id numérico vindo da URL, da query ou do corpo (texto ou número). */
export const idSchema = z.coerce.number().int().positive().max(ID_MAX);
