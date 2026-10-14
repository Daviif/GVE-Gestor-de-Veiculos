import { defineConfig } from 'prisma/config';

// O Prisma 7 não lê o .env sozinho: carrega o da raiz do repositório, se existir.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // sem .env: segue com process.env
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` não conecta ao banco; no CI a variável pode faltar.
    url: process.env.DATABASE_URL ?? '',
  },
});
