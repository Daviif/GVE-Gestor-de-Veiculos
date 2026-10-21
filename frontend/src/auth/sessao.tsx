import type { UsuarioSessao } from '@gve/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ErroApi, EVENTO_SESSAO_EXPIRADA } from '../api';
import { ContextoSessao, type Sessao } from './contexto';

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSessao | null | undefined>(undefined);
  const [aviso, setAviso] = useState<string | null>(null);
  const logado = useRef(false);

  useEffect(() => {
    logado.current = Boolean(usuario);
  }, [usuario]);

  useEffect(() => {
    api<{ usuario: UsuarioSessao }>('/auth/me')
      .then((r) => setUsuario(r.usuario))
      .catch((erro) => {
        setUsuario(null);
        if (erro instanceof ErroApi && erro.status !== 401) setAviso(erro.message);
      });
  }, []);

  useEffect(() => {
    function expirou() {
      // Sem usuário logado, o 401 é só a conferência inicial: não há o que avisar.
      if (logado.current) setAviso('Sua sessão expirou. Entre novamente.');
      setUsuario(null);
    }
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, expirou);
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, expirou);
  }, []);

  const entrar = useCallback(async (dados: Parameters<Sessao['entrar']>[0]) => {
    const r = await api<{ usuario: UsuarioSessao }>('/auth/login', {
      metodo: 'POST',
      corpo: dados,
    });
    setAviso(null);
    setUsuario(r.usuario);
    return r.usuario;
  }, []);

  const sair = useCallback(async () => {
    try {
      await api('/auth/logout', { metodo: 'POST' });
    } finally {
      setAviso(null);
      setUsuario(null);
    }
  }, []);

  const valor = useMemo(
    () => ({ usuario, aviso, entrar, sair, atualizarUsuario: setUsuario }),
    [usuario, aviso, entrar, sair],
  );
  return <ContextoSessao.Provider value={valor}>{children}</ContextoSessao.Provider>;
}
