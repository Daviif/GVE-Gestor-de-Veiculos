import type { Perfil } from '@gve/shared';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useSessao } from './contexto';

interface Props {
  /** Sem perfil: qualquer usuário logado. */
  perfil?: Perfil;
  /** Libera a tela de troca de senha para quem ainda precisa trocá-la. */
  trocaSenha?: boolean;
}

/** Só deixa passar quem está logado, com o perfil certo e sem troca de senha pendente (RNF08). */
export function RotaProtegida({ perfil, trocaSenha = false }: Props) {
  const { usuario } = useSessao();
  const local = useLocation();

  if (usuario === undefined) {
    return (
      <p className="carregando" role="status">
        Carregando…
      </p>
    );
  }
  if (!usuario) return <Navigate to="/entrar" replace state={{ de: local.pathname }} />;
  if (usuario.trocaSenhaObrigatoria && !trocaSenha) return <Navigate to="/trocar-senha" replace />;
  if (!usuario.trocaSenhaObrigatoria && trocaSenha) return <Navigate to="/" replace />;
  if (perfil && usuario.perfil !== perfil) return <Navigate to="/" replace />;
  return <Outlet />;
}
