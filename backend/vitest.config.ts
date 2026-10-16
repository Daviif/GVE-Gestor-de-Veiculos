import { defineConfig } from 'vitest/config';

// Os testes usam um banco separado (gve_teste) no mesmo PostgreSQL do desenvolvimento,
// recriado a cada execução pelo test/preparar-banco.ts. Requer `npm run db:up`.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // sem .env: segue com process.env (CI)
}

function urlBancoTeste(): string {
  if (process.env.DATABASE_URL_TESTE) return process.env.DATABASE_URL_TESTE;
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://gve:gve@localhost:5432/gve');
  url.pathname = '/gve_teste';
  return url.toString();
}

export default defineConfig({
  test: {
    env: { NODE_ENV: 'test', DATABASE_URL: urlBancoTeste() },
    globalSetup: ['test/preparar-banco.ts'],
    // Os arquivos de teste compartilham o banco: um de cada vez.
    fileParallelism: false,
  },
});
