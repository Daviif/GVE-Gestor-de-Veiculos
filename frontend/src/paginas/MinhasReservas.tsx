import { ROTULO_TURNO, type Reserva } from '@gve/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { api, ErroApi } from '../api';
import { useSessao } from '../auth/contexto';
import { dataComSemana, hojeEmSaoPaulo } from '../datas';
import { useToast } from '../toast/contexto';

function mensagemDe(erro: unknown): string {
  return erro instanceof ErroApi ? erro.message : 'Erro inesperado. Tente novamente.';
}

interface PropsItem {
  reserva: Reserva;
  aoCancelar(reserva: Reserva): void;
}

/** Reserva futura: barra lateral azul, dados e botão "Cancelar" em vermelho. */
function ItemProxima({ reserva, aoCancelar }: PropsItem) {
  return (
    <li className="reserva-proxima" aria-label={`Reserva ${reserva.destino}`}>
      <div className="reserva-barra" aria-hidden="true" />
      <div className="reserva-dados">
        <div className="reserva-titulo">
          {dataComSemana(reserva.data)} · {ROTULO_TURNO[reserva.turno]}
        </div>
        <div className="reserva-sub">
          {reserva.veiculo.modelo} · {reserva.veiculo.placa} — {reserva.destino}
        </div>
      </div>
      <button type="button" className="botao-perigo-pequeno" onClick={() => aoCancelar(reserva)}>
        Cancelar
      </button>
    </li>
  );
}

/** Reserva anterior ou cancelada: só leitura, com situação à direita. */
function ItemAnterior({ reserva }: { reserva: Reserva }) {
  const cancelada = reserva.status === 'CANCELADA';
  return (
    <li className="reserva-anterior">
      <div className="reserva-dados">
        <div className="reserva-titulo">
          {dataComSemana(reserva.data)} · {ROTULO_TURNO[reserva.turno]}
        </div>
        <div className="reserva-sub">
          {reserva.veiculo.modelo} · {reserva.veiculo.placa} — {reserva.destino}
        </div>
      </div>
      <span className={cancelada ? 'reserva-status cancelada' : 'reserva-status'}>
        {cancelada ? 'Cancelada' : 'Concluída'}
      </span>
    </li>
  );
}

/** Tela inicial (RF10, RF11): próximas reservas do usuário e histórico, com cancelamento. */
export function MinhasReservas() {
  const { usuario } = useSessao();
  const toast = useToast();
  const [reservas, setReservas] = useState<Reserva[] | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const primeiroNome = usuario?.nome.split(' ')[0];

  useEffect(() => {
    api<{ reservas: Reserva[] }>('/reservas/minhas')
      .then((r) => setReservas(r.reservas))
      .catch((e) => setErro(mensagemDe(e)));
  }, []);

  const { proximas, anteriores } = useMemo(() => {
    const hoje = hojeEmSaoPaulo();
    const proximas: Reserva[] = [];
    const anteriores: Reserva[] = [];
    for (const r of reservas ?? []) {
      if (r.status === 'ATIVA' && r.data >= hoje) proximas.push(r);
      else anteriores.push(r);
    }
    // A API já ordena por data desc; nas próximas quero a mais perto primeiro.
    proximas.reverse();
    return { proximas, anteriores };
  }, [reservas]);

  async function cancelar(reserva: Reserva) {
    if (
      !window.confirm(
        `Cancelar a reserva de ${reserva.veiculo.placa} em ${dataComSemana(reserva.data)}?`,
      )
    ) {
      return;
    }
    try {
      const r = await api<{ reserva: Reserva }>(`/reservas/${reserva.id}/cancelar`, {
        metodo: 'POST',
        corpo: {},
      });
      setReservas((atuais) => atuais?.map((x) => (x.id === r.reserva.id ? r.reserva : x)));
      toast('Reserva cancelada.');
    } catch (e) {
      toast(mensagemDe(e));
    }
  }

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

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      <section className="pilha-curta">
        <h2 className="rotulo-lista">Próximas</h2>
        {reservas === undefined ? (
          <div className="vazio" role="status">
            Carregando…
          </div>
        ) : proximas.length === 0 ? (
          <div className="vazio">Você não tem reservas futuras.</div>
        ) : (
          <ul className="lista-reservas">
            {proximas.map((r) => (
              <ItemProxima key={r.id} reserva={r} aoCancelar={cancelar} />
            ))}
          </ul>
        )}
      </section>

      {anteriores.length > 0 && (
        <section className="pilha-curta">
          <h2 className="rotulo-lista">Anteriores</h2>
          <ul className="lista-reservas">
            {anteriores.map((r) => (
              <ItemAnterior key={r.id} reserva={r} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
