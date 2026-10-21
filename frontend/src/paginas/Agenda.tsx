import { ROTULO_TURNO, TURNOS, type ReservaAgenda, type Turno } from '@gve/shared';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { api, ErroApi } from '../api';
import { dataLonga, diaMes, hojeEmSaoPaulo, inicioDaSemana, somarDias } from '../datas';

function mensagemDe(erro: unknown): string {
  return erro instanceof ErroApi ? erro.message : 'Erro inesperado. Tente novamente.';
}

const DIAS_SEMANA_CURTOS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const DIAS_SEMANA_LONGOS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

interface PropsCelula {
  reservas: ReservaAgenda[];
}

function Celula({ reservas }: PropsCelula) {
  if (reservas.length === 0) {
    return <div className="agenda-celula vazia" aria-label="Sem reservas" />;
  }
  return (
    <div className="agenda-celula">
      <ul className="agenda-lista">
        {reservas.map((r) => (
          <li key={r.id} className="agenda-reserva">
            <div className="agenda-reserva-veiculo">
              {r.veiculo.modelo} · {r.veiculo.placa}
            </div>
            <div className="agenda-reserva-dados">
              {/* O "·" fica preso ao nome (espaço não separável): sozinho, quebrava numa linha própria. */}
              <span>{r.usuario.nome}&nbsp;·</span>
              <span>{r.destino}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Agenda da frota (RF13): grade semanal no desktop, lista por dia no celular. */
export function Agenda() {
  const [inicio, setInicio] = useState<string>(() => inicioDaSemana(hojeEmSaoPaulo()));
  // Guarda os dados junto da janela que os produziu, para derivar "carregando" sem resetar.
  const [carregado, setCarregado] = useState<{ janela: string; reservas: ReservaAgenda[] } | null>(
    null,
  );
  const [erro, setErro] = useState<string | null>(null);

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => somarDias(inicio, i)), [inicio]);
  const fim = dias[6]!;
  const janelaAtual = `${inicio}|${fim}`;
  const carregando = carregado?.janela !== janelaAtual;
  const reservas = carregado?.reservas;

  useEffect(() => {
    let ativo = true;
    const url = `/agenda?inicio=${inicio}&fim=${fim}`;
    api<{ reservas: ReservaAgenda[] }>(url)
      .then((r) => {
        if (!ativo) return;
        setCarregado({ janela: `${inicio}|${fim}`, reservas: r.reservas });
        setErro(null);
      })
      .catch((e) => {
        if (ativo) setErro(mensagemDe(e));
      });
    return () => {
      ativo = false;
    };
  }, [inicio, fim]);

  /** Mapa data|turno → reservas, para desenhar a grade em O(1) por célula. */
  const porCelula = useMemo(() => {
    const mapa = new Map<string, ReservaAgenda[]>();
    for (const r of reservas ?? []) {
      const chave = `${r.data}|${r.turno}`;
      const lista = mapa.get(chave);
      if (lista) lista.push(r);
      else mapa.set(chave, [r]);
    }
    return mapa;
  }, [reservas]);

  function reservasDe(dia: string, turno: Turno): ReservaAgenda[] {
    return porCelula.get(`${dia}|${turno}`) ?? [];
  }

  const hoje = hojeEmSaoPaulo();

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <h1 className="titulo-pagina">Agenda da frota</h1>
        <div className="acoes">
          <button
            type="button"
            className="botao-borda botao-pequeno"
            onClick={() => setInicio(somarDias(inicio, -7))}
          >
            ← Semana anterior
          </button>
          <button
            type="button"
            className="botao-borda botao-pequeno"
            onClick={() => setInicio(inicioDaSemana(hoje))}
          >
            Hoje
          </button>
          <button
            type="button"
            className="botao-borda botao-pequeno"
            onClick={() => setInicio(somarDias(inicio, 7))}
          >
            Próxima semana →
          </button>
        </div>
      </div>

      <div className="texto-suave">
        Semana de {dataLonga(inicio)} a {dataLonga(fim)}
      </div>

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      {carregando || reservas === undefined ? (
        <div className="vazio" role="status">
          Carregando…
        </div>
      ) : (
        <>
          {/* Desktop: grade semanal */}
          <div className="agenda-grade so-desktop" role="grid" aria-label="Agenda semanal">
            <div className="agenda-cabecalho" />
            {dias.map((dia, i) => (
              <div
                key={dia}
                className={dia === hoje ? 'agenda-cabecalho hoje' : 'agenda-cabecalho'}
              >
                <div className="agenda-cabecalho-dia">{DIAS_SEMANA_CURTOS[i]}</div>
                <div className="agenda-cabecalho-data">{diaMes(dia)}</div>
              </div>
            ))}
            {TURNOS.map((turno) => (
              <Fragment key={turno}>
                <div className="agenda-rotulo-turno">{ROTULO_TURNO[turno]}</div>
                {dias.map((dia) => (
                  <Celula key={`${dia}-${turno}`} reservas={reservasDe(dia, turno)} />
                ))}
              </Fragment>
            ))}
          </div>

          {/* Celular: lista por dia */}
          <div className="agenda-lista-dias so-celular">
            {dias.map((dia, i) => {
              const total = TURNOS.reduce((n, t) => n + reservasDe(dia, t).length, 0);
              return (
                <section key={dia} className="agenda-dia-cartao">
                  <h2 className={dia === hoje ? 'agenda-dia-titulo hoje' : 'agenda-dia-titulo'}>
                    {DIAS_SEMANA_LONGOS[i]} · {diaMes(dia)}
                  </h2>
                  {total === 0 ? (
                    <div className="vazio">Nenhuma reserva nesse dia.</div>
                  ) : (
                    TURNOS.map((turno) => {
                      const linhas = reservasDe(dia, turno);
                      if (linhas.length === 0) return null;
                      return (
                        <div key={turno} className="agenda-dia-turno">
                          <div className="rotulo-lista">{ROTULO_TURNO[turno]}</div>
                          <Celula reservas={linhas} />
                        </div>
                      );
                    })
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
