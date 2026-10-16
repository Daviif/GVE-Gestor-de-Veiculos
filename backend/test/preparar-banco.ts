import { execFileSync } from 'node:child_process';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

/** Cria o banco de teste, se preciso, e aplica as migrações. Cada teste limpa as tabelas que usa. */
export default async function prepararBanco(projeto: TestProject) {
  const env = { ...process.env, ...projeto.config.env };
  const url = new URL(env.DATABASE_URL!);
  const nome = url.pathname.slice(1);

  url.pathname = '/postgres';
  const cliente = new pg.Client({ connectionString: url.toString() });
  await cliente.connect();
  try {
    const existe = await cliente.query('SELECT 1 FROM pg_database WHERE datname = $1', [nome]);
    if (existe.rowCount === 0) await cliente.query(`CREATE DATABASE "${nome}"`);
  } finally {
    await cliente.end();
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { env, stdio: 'pipe' });
}
