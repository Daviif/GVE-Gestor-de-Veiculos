import type { Usuario } from '../generated/prisma/client';

declare global {
  namespace Express {
    interface Request {
      /** Preenchido pelo middleware de autenticação. */
      usuario?: Usuario;
      /** Id (hash) da sessão em uso. */
      sessaoId?: string;
    }
  }
}
