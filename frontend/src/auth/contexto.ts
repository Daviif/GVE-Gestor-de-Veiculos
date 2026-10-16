import type { LoginEntrada, UsuarioSessao } from '@gve/shared';
import { createContext, useContext } from 'react';

export interface Sessao {
  /** undefined enquanto confere se já há sessão aberta. */
  usuario: UsuarioSessao | null | undefined;
  /** Aviso para a tela de login (ex.: sessão expirada). */
  aviso: string | null;
  entrar(dados: LoginEntrada): Promise<UsuarioSessao>;
  sair(): Promise<void>;
  atualizarUsuario(usuario: UsuarioSessao): void;
}

export const ContextoSessao = createContext<Sessao | null>(null);

export function useSessao(): Sessao {
  const sessao = useContext(ContextoSessao);
  if (!sessao) throw new Error('useSessao fora do ProvedorSessao');
  return sessao;
}
