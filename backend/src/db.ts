import { PrismaPg } from '@prisma/adapter-pg';
import { config } from './config';
import { PrismaClient } from './generated/prisma/client';

/**
 * Cliente único do banco. Só conecta na primeira consulta.
 *
 * Pool pensado para a VPS de 2 GB (os padrões do pg pressupõem servidor com folga):
 * - `max` 10: cobre os 30 usuários simultâneos do RNF10 (cada requisição segura a conexão por
 *   poucos ms) e fica bem abaixo do `max_connections` 100 do Postgres.
 * - `min` 1 e ociosas por 10 min: cada conexão nova é um processo novo do Postgres; com a
 *   memória apertada, abrir uma pode passar dos 2 s do Prisma e virar P2028.
 * - `connectionTimeoutMillis` e `maxWait` 10 s: com o pool esgotado, quem espera desiste com
 *   erro em vez de ficar pendurado até o timeout do Nginx (o padrão do pg é esperar para sempre).
 * - `statement_timeout` 30 s: muito acima de qualquer consulta normal; uma consulta presa é
 *   cancelada pelo Postgres em vez de segurar a conexão sem prazo.
 * - `idle_in_transaction_session_timeout` 60 s: transação esquecida aberta não trava linhas
 *   para sempre.
 */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: config.DATABASE_URL,
    max: 10,
    min: 1,
    idleTimeoutMillis: 10 * 60 * 1000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    idle_in_transaction_session_timeout: 60_000,
  }),
  transactionOptions: { maxWait: 10_000 },
});
