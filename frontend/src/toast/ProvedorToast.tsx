import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ContextoToast } from './contexto';

const DURACAO_MS = 2800;

export function ProvedorToast({ children }: { children: ReactNode }) {
  const [mensagem, setMensagem] = useState('');
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  const mostrar = useCallback((texto: string) => {
    setMensagem(texto);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setMensagem(''), DURACAO_MS);
  }, []);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  return (
    <ContextoToast.Provider value={mostrar}>
      {children}
      <div className="toast" role="status" aria-live="polite" hidden={!mensagem}>
        {mensagem}
      </div>
    </ContextoToast.Provider>
  );
}
