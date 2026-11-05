import { useEffect } from 'react';

/**
 * Título da aba do navegador: é o primeiro que o leitor de tela anuncia ao abrir a tela e o que
 * aparece no histórico e nas abas (WCAG 2.4.2).
 */
export function useTitulo(titulo: string) {
  useEffect(() => {
    document.title = titulo ? `${titulo} · Gestão Veicular` : 'Gestão Veicular';
  }, [titulo]);
}
