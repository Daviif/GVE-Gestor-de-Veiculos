import { createContext, useContext } from 'react';

/** Mostra uma mensagem curta no rodapé da tela, que some sozinha. */
export const ContextoToast = createContext<(mensagem: string) => void>(() => {});

export function useToast() {
  return useContext(ContextoToast);
}
