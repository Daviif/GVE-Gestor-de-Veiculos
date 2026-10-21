import type { Perfil } from '@gve/shared';
import type { RequestHandler } from 'express';
import {
  apagarCookieSessao,
  gravarCookieSessao,
  lerTokenSessao,
  usarSessao,
} from '../seguranca/sessao';
import { ErroApi } from './erros';

interface Opcoes {
  /** Libera a rota para quem ainda precisa trocar a senha do primeiro acesso. */
  permitirTrocaPendente?: boolean;
}

/** Exige sessão válida e renova o cookie (RNF11). */
export function autenticar({ permitirTrocaPendente = false }: Opcoes = {}): RequestHandler {
  return async (req, res, next) => {
    const token = lerTokenSessao(req);
    const sessao = token ? await usarSessao(token) : null;
    if (!token || !sessao) {
      if (token) apagarCookieSessao(res);
      throw new ErroApi(401, 'NAO_AUTENTICADO', 'Sua sessão expirou. Entre novamente.');
    }

    gravarCookieSessao(res, token);
    req.usuario = sessao.usuario;
    req.sessaoId = sessao.id;

    if (sessao.usuario.trocaSenhaObrigatoria && !permitirTrocaPendente) {
      throw new ErroApi(403, 'TROCA_SENHA_OBRIGATORIA', 'Troque a senha antes de continuar.');
    }
    next();
  };
}

/** Restringe a rota a um perfil (RNF08). Usar depois de autenticar(). */
export function exigirPerfil(perfil: Perfil): RequestHandler {
  return (req, _res, next) => {
    if (req.usuario?.perfil !== perfil) {
      throw new ErroApi(403, 'SEM_PERMISSAO', 'Você não tem permissão para acessar esta página.');
    }
    next();
  };
}
