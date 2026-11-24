import type { AcaoAuditoria, Prisma } from './generated/prisma/client';

interface Registro {
  acao: AcaoAuditoria;
  usuarioId: number | null;
  entidade?: string;
  entidadeId?: number;
  detalhes?: Prisma.InputJsonObject;
  /** Obrigatório (mesmo que `req.ip` venha undefined), para nenhuma rota esquecer de passar. */
  ip: string | undefined;
}

/**
 * Grava uma linha no log_auditoria (RF15, RF16). Recebe o cliente da transação: o registro
 * entra junto com a mudança que ele descreve, ou nenhum dos dois entra. Fora de transação,
 * passe o `prisma`.
 */
export async function registrarAuditoria(
  db: Prisma.TransactionClient,
  registro: Registro,
): Promise<void> {
  await db.logAuditoria.create({ data: registro });
}
