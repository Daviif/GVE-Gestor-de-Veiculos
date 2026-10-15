import { Link } from 'react-router';
import { useSessao } from '../auth/contexto';

/** Tela inicial. A listagem das reservas entra com a funcionalidade de reservas. */
export function MinhasReservas() {
  const { usuario } = useSessao();
  const primeiroNome = usuario?.nome.split(' ')[0];

  return (
    <div className="pagina pagina-media">
      <div className="pagina-topo">
        <div>
          <div className="so-desktop texto-suave">Olá, {primeiroNome}</div>
          <h1 className="titulo-pagina">Minhas reservas</h1>
        </div>
        <Link to="/reservas/nova" className="botao botao-nova-reserva">
          + Nova reserva
        </Link>
      </div>

      <section className="pilha-curta">
        <h2 className="rotulo-lista">Próximas</h2>
        <div className="vazio">Você não tem reservas futuras.</div>
      </section>
    </div>
  );
}
