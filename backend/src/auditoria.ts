import { prisma } from './db';
import type { AcaoAuditoria, Prisma } from './generated/prisma/client';

interface Registro {
  acao: AcaoAuditoria;
  usuarioId?: number | null;
  entidade?: string;
  entidadeId?: number;
  detalhes?: Prisma.InputJsonObject;
  ip?: string;
}

/** Grava uma linha no log_auditoria (RF15, RF16). */
export async function registrarAuditoria(registro: Registro): Promise<void> {
  await prisma.logAuditoria.create({ data: registro });
}
