import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import { config } from '../config';
import { prisma } from '../db';

/** RNF11: a sessão vence após 30 min sem uso. */
export const SESSAO_DURACAO_MS = 30 * 60 * 1000;
/** Evita gravar no banco a cada requisição: só renova se já passou 1 min do último uso. */
const RENOVAR_APOS_MS = 60 * 1000;

export const COOKIE_SESSAO = 'gve_sessao';

const opcoesCookie: CookieOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api',
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function lerTokenSessao(req: Request): string | undefined {
  const cabecalho = req.headers.cookie;
  if (!cabecalho) return undefined;
  for (const par of cabecalho.split(';')) {
    const [nome, ...valor] = par.trim().split('=');
    if (nome === COOKIE_SESSAO) return decodeURIComponent(valor.join('='));
  }
  return undefined;
}

export function gravarCookieSessao(res: Response, token: string): void {
  res.cookie(COOKIE_SESSAO, token, { ...opcoesCookie, maxAge: SESSAO_DURACAO_MS });
}

export function apagarCookieSessao(res: Response): void {
  res.clearCookie(COOKIE_SESSAO, opcoesCookie);
}

/** Abre uma sessão e devolve o token que vai no cookie. Aproveita para limpar as vencidas. */
export async function abrirSessao(usuarioId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const agora = Date.now();
  await prisma.sessao.deleteMany({ where: { expiraEm: { lt: new Date(agora) } } });
  await prisma.sessao.create({
    data: { id: hashToken(token), usuarioId, expiraEm: new Date(agora + SESSAO_DURACAO_MS) },
  });
  return token;
}

/**
 * Busca a sessão do token e a renova. Devolve null se não existe, venceu ou o usuário
 * foi desativado; nesses dois últimos casos a sessão é apagada.
 */
export async function usarSessao(token: string) {
  const id = hashToken(token);
  const sessao = await prisma.sessao.findUnique({ where: { id }, include: { usuario: true } });
  if (!sessao) return null;

  const agora = Date.now();
  if (sessao.expiraEm.getTime() <= agora || !sessao.usuario.ativo) {
    await prisma.sessao.deleteMany({ where: { id } });
    return null;
  }

  const novaExpiracao = agora + SESSAO_DURACAO_MS;
  if (novaExpiracao - sessao.expiraEm.getTime() >= RENOVAR_APOS_MS) {
    await prisma.sessao.update({ where: { id }, data: { expiraEm: new Date(novaExpiracao) } });
  }
  return { id, usuario: sessao.usuario };
}

/** Apaga a sessão do token e devolve de quem era, ou null se já não existia. */
export async function encerrarSessao(token: string): Promise<number | null> {
  const id = hashToken(token);
  const sessao = await prisma.sessao.findUnique({ where: { id }, select: { usuarioId: true } });
  await prisma.sessao.deleteMany({ where: { id } });
  return sessao?.usuarioId ?? null;
}
