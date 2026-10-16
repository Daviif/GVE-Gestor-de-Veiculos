import { useLocation } from 'react-router';
import { tituloDaPagina } from '../componentes/navegacao';

/** Telas do menu que ainda não foram implementadas. */
export function EmConstrucao() {
  const { pathname } = useLocation();
  return (
    <div className="pagina pagina-media">
      <h1 className="titulo-pagina">{tituloDaPagina(pathname)}</h1>
      <div className="vazio">Esta tela ainda está em construção.</div>
    </div>
  );
}
