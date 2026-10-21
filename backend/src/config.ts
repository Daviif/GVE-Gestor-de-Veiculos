import { z } from 'zod';

// Carrega o .env da raiz do repositório, se existir; em produção as variáveis vêm do ambiente.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  // sem .env: segue com process.env
}

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.string().optional(),
  // RF17: importação dos feriados nacionais.
  BRASILAPI_URL: z.url().default('https://brasilapi.com.br/api'),
});

export const config = esquema.parse(process.env);
