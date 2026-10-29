import {
  ANTECEDENCIA_MAX,
  ANTECEDENCIA_MIN,
  ROTULO_TURNO,
  TURNOS,
  type ReservaAgenda,
  type RespostaAgenda,
  type Turno,
  type VeiculoAgenda,
} from '@gve/shared';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, ErroApi } from '../api';
import { useSessao } from '../auth/contexto';
import { diaComSemana, diaMes, hojeEmSaoPaulo, inicioDaSemana, somarDias } from '../datas';
import type { PreenchimentoReserva } from './reservas/NovaReserva';

function mensagemDe(erro: unknown): string {
  return erro instanceof ErroApi ? erro.message : 'Erro inesperado. Tente novamente.';
}

const DIAS_SEMANA_CURTOS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const LARGURA_POPOVER = 260;

function primeiroNome(nome: string): string {
  return nome.split(' ')[0] ?? nome;
}

/**
 * Resultado da busca de uma janela. Guarda sucesso ou erro com a mesma chave: assim "carregando"
 * termina em qualquer um dos dois e um erro não deixa a tela presa.
 */
type Resultado =
  | { tipo: 'ok'; janela: string; dados: RespostaAgenda }
  | { tipo: 'erro'; janela: string; mensagem: string };

/** Detalhe da reserva aberto ao clicar no chip. Fica fixo na tela, para a grade rolar sem cortá-lo. */
interface PopoverAberto {
  id: number;
  esquerda: number;
  topo: number;
  acima: boolean;
}

/** Onde o detalhe fica em relação ao chip: embaixo, ou em cima se faltar espaço na tela. */
function posicionar(chip: Element): Omit<PopoverAberto, 'id'> {
  const caixa = chip.getBoundingClientRect();
  const acima = window.innerHeight - caixa.bottom < 150;
  return {
    esquerda: Math.max(8, Math.min(caixa.left, window.innerWidth - LARGURA_POPOVER - 8)),
    topo: acima ? caixa.top - 4 : caixa.bottom + 4,
    acima,
  };
}

/** Agenda da frota (RF13): grade veículo × turno por semana no desktop, lista por dia no celular. */
export function Agenda() {
  const { usuario } = useSessao();
  const navegar = useNavigate();
  const hoje = hojeEmSaoPaulo();

  const [inicio, setInicio] = useState<string>(() => inicioDaSemana(hoje));
  const [diaEscolhido, setDiaEscolhido] = useState<string>(hoje);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [popover, setPopover] = useState<PopoverAberto | null>(null);

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => somarDias(inicio, i)), [inicio]);
  const fim = dias[6]!;
  const janela = `${inicio}|${fim}`;
  const carregando = resultado?.janela !== janela;
  const dados = resultado?.tipo === 'ok' && !carregando ? resultado.dados : undefined;
  const erro = resultado?.tipo === 'erro' && !carregando ? resultado.mensagem : null;

  useEffect(() => {
    let ativo = true;
    api<RespostaAgenda>(`/agenda?inicio=${inicio}&fim=${fim}`)
      .then((r) => {
        if (ativo) setResultado({ tipo: 'ok', janela: `${inicio}|${fim}`, dados: r });
      })
      .catch((e) => {
        if (ativo) {
          setResultado({ tipo: 'erro', janela: `${inicio}|${fim}`, mensagem: mensagemDe(e) });
        }
      });
    return () => {
      ativo = false;
    };
  }, [inicio, fim, tentativa]);

  // O detalhe fecha com Esc ou clique fora. Ao rolar ou redimensionar ele acompanha o chip: o
  // navegador rola a grade sozinho para mostrar o chip clicado, e fechar nesse momento fazia o
  // detalhe sumir logo depois de abrir. Só fecha se o chip sair da área visível da grade.
  const idAberto = popover?.id;
  useEffect(() => {
    if (idAberto === undefined) return;
    const fechar = () => setPopover(null);
    const acompanhar = () => {
      const chip = document.querySelector(`[data-agenda-chip="${idAberto}"]`);
      if (!chip) return fechar();
      const area = chip.closest('.agenda-rolagem')?.getBoundingClientRect();
      const caixa = chip.getBoundingClientRect();
      if (area && (caixa.right < area.left || caixa.left > area.right)) return fechar();
      const nova = posicionar(chip);
      setPopover((atual) =>
        atual &&
        atual.esquerda === nova.esquerda &&
        atual.topo === nova.topo &&
        atual.acima === nova.acima
          ? atual
          : { id: idAberto, ...nova },
      );
    };
    const aoApertar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
    };
    const aoClicar = (e: globalThis.MouseEvent) => {
      const alvo = e.target as Element | null;
      if (!alvo?.closest('[data-agenda-popover], [data-agenda-chip]')) fechar();
    };
    window.addEventListener('keydown', aoApertar);
    window.addEventListener('mousedown', aoClicar);
    window.addEventListener('resize', acompanhar);
    window.addEventListener('scroll', acompanhar, true);
    return () => {
      window.removeEventListener('keydown', aoApertar);
      window.removeEventListener('mousedown', aoClicar);
      window.removeEventListener('resize', acompanhar);
      window.removeEventListener('scroll', acompanhar, true);
    };
  }, [idAberto]);

  const reservaPorCelula = useMemo(() => {
    const mapa = new Map<string, ReservaAgenda>();
    for (const r of dados?.reservas ?? []) mapa.set(`${r.veiculo.id}|${r.data}|${r.turno}`, r);
    return mapa;
  }, [dados]);

  const feriadoPorDia = useMemo(
    () => new Map((dados?.feriados ?? []).map((f) => [f.data, f.descricao])),
    [dados],
  );

  const reservaDe = (v: VeiculoAgenda, dia: string, turno: Turno) =>
    reservaPorCelula.get(`${v.id}|${dia}|${turno}`);

  /** RN02, RN03, RN11: só se reserva de D+5 a D+7 e fora de feriado. */
  const podeReservar = (dia: string) =>
    dia >= somarDias(hoje, ANTECEDENCIA_MIN) &&
    dia <= somarDias(hoje, ANTECEDENCIA_MAX) &&
    !feriadoPorDia.has(dia);

  /** Leva para a nova reserva já no passo 2, com data, turno e veículo escolhidos. */
  function reservar(v: VeiculoAgenda, dia: string, turno: Turno) {
    const preenchimento: PreenchimentoReserva = { data: dia, turno, veiculoId: v.id };
    navegar('/reservas/nova', { state: preenchimento });
  }

  function alternarDetalhe(reserva: ReservaAgenda, e: MouseEvent<HTMLButtonElement>) {
    if (popover?.id === reserva.id) {
      setPopover(null);
      return;
    }
    setPopover({ id: reserva.id, ...posicionar(e.currentTarget) });
  }

  const diaMovel = dias.includes(diaEscolhido)
    ? diaEscolhido
    : dias.includes(hoje)
      ? hoje
      : dias[0]!;
  const reservaAberta = popover ? dados?.reservas.find((r) => r.id === popover.id) : undefined;

  function mudarSemana(delta: number) {
    setPopover(null);
    setInicio(somarDias(inicio, delta));
  }

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <h1 className="titulo-pagina">Agenda da frota</h1>
        <div className="agenda-semana" role="group" aria-label="Semana">
          <button
            type="button"
            className="agenda-semana-seta"
            aria-label="Semana anterior"
            onClick={() => mudarSemana(-7)}
          >
            ‹
          </button>
          <span className="agenda-semana-rotulo">
            {diaMes(dias[0]!)} a {diaMes(fim)}
          </span>
          <button
            type="button"
            className="agenda-semana-seta"
            aria-label="Próxima semana"
            onClick={() => mudarSemana(7)}
          >
            ›
          </button>
        </div>
      </div>

      {erro && (
        <div className="acoes">
          <p className="erro" role="alert">
            {erro}
          </p>
          <button
            type="button"
            className="botao-borda botao-pequeno"
            onClick={() => setTentativa((n) => n + 1)}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {carregando && (
        <div className="vazio" role="status">
          Carregando…
        </div>
      )}

      {dados && (
        <>
          {/* Desktop: grade semanal, uma linha por veículo e turno */}
          <div className="so-desktop">
            <div className="agenda-rolagem">
              <div className="agenda-grade" role="grid" aria-label="Agenda semanal">
                <div className="agenda-linha agenda-linha-topo">
                  <div />
                  {dias.map((dia, i) => {
                    const feriado = feriadoPorDia.get(dia);
                    const classe = [
                      'agenda-cabecalho',
                      dia === hoje ? 'hoje' : '',
                      feriado ? 'feriado' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <div key={dia} className={classe}>
                        <div className="agenda-cabecalho-dia">
                          {DIAS_SEMANA_CURTOS[i]} {dia.slice(8, 10)}
                        </div>
                        <div className="agenda-cabecalho-feriado" title={feriado}>
                          {feriado ? 'Feriado' : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {dados.veiculos.length === 0 && (
                  <div className="vazio agenda-vazia">Nenhum veículo cadastrado.</div>
                )}

                {dados.veiculos.map((v, indice) =>
                  TURNOS.map((turno) => (
                    <div
                      key={`${v.id}-${turno}`}
                      className={
                        turno === TURNOS[0] && indice > 0
                          ? 'agenda-linha agenda-linha-veiculo'
                          : 'agenda-linha'
                      }
                    >
                      <div className="agenda-rotulo">
                        <div className="agenda-rotulo-veiculo">
                          {turno === TURNOS[0] && (
                            <>
                              <span className="agenda-veiculo-nome">{v.modelo}</span>
                              <span className="agenda-veiculo-placa">{v.placa}</span>
                            </>
                          )}
                        </div>
                        <span className="agenda-rotulo-turno">{ROTULO_TURNO[turno]}</span>
                      </div>
                      {dias.map((dia) => {
                        const reserva = reservaDe(v, dia, turno);
                        const minha = reserva?.usuario.id === usuario?.id;
                        const classe = [
                          'agenda-celula',
                          dia === hoje ? 'hoje' : '',
                          feriadoPorDia.has(dia) ? 'feriado' : '',
                        ]
                          .filter(Boolean)
                          .join(' ');
                        return (
                          <div key={dia} className={classe}>
                            {reserva ? (
                              <button
                                type="button"
                                data-agenda-chip={reserva.id}
                                className={minha ? 'agenda-chip minha' : 'agenda-chip'}
                                aria-expanded={popover?.id === reserva.id}
                                title={reserva.usuario.nome}
                                onClick={(e) => alternarDetalhe(reserva, e)}
                              >
                                {primeiroNome(reserva.usuario.nome)}
                              </button>
                            ) : (
                              podeReservar(dia) && (
                                <button
                                  type="button"
                                  className="agenda-livre"
                                  aria-label={`Reservar ${v.modelo} ${v.placa}, ${diaComSemana(dia)}, ${ROTULO_TURNO[turno]}`}
                                  onClick={() => reservar(v, dia, turno)}
                                >
                                  + reservar
                                </button>
                              )
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )),
                )}
              </div>
            </div>

            <div className="agenda-legenda">
              <span className="agenda-legenda-item">
                <span className="agenda-legenda-cor minha" />
                suas reservas
              </span>
              <span className="agenda-legenda-item">
                <span className="agenda-legenda-cor outros" />
                outros servidores (clique para ver destino)
              </span>
              <span className="agenda-legenda-item">
                <span className="agenda-legenda-cor livre" />
                livre (clique para reservar)
              </span>
            </div>
          </div>

          {/* Celular: escolhe o dia e vê os veículos com os dois turnos */}
          <div className="so-celular pilha">
            <div className="agenda-dias-movel">
              {dias.map((dia, i) => (
                <button
                  key={dia}
                  type="button"
                  aria-pressed={dia === diaMovel}
                  className={[
                    'agenda-dia-botao',
                    dia === diaMovel ? 'ativo' : '',
                    feriadoPorDia.has(dia) ? 'feriado' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setDiaEscolhido(dia)}
                >
                  <span className="agenda-dia-dow">{DIAS_SEMANA_CURTOS[i]}</span>
                  <span className="agenda-dia-num">{dia.slice(8, 10)}</span>
                </button>
              ))}
            </div>

            {feriadoPorDia.has(diaMovel) && (
              <div className="agenda-feriado-aviso">Feriado: {feriadoPorDia.get(diaMovel)}</div>
            )}

            {dados.veiculos.map((v) => (
              <section key={v.id} className="agenda-veiculo-cartao" aria-label={v.modelo}>
                <div className="agenda-veiculo-topo">
                  <span className="agenda-veiculo-nome">{v.modelo}</span>
                  <span className="agenda-veiculo-sub">{v.placa}</span>
                </div>
                {TURNOS.map((turno) => {
                  const reserva = reservaDe(v, diaMovel, turno);
                  const minha = reserva?.usuario.id === usuario?.id;
                  return (
                    <div key={turno} className="agenda-faixa">
                      <span className="agenda-faixa-turno">{ROTULO_TURNO[turno]}</span>
                      {reserva ? (
                        <div
                          className={minha ? 'agenda-faixa-reserva minha' : 'agenda-faixa-reserva'}
                        >
                          <div className="agenda-faixa-nome">
                            {minha ? 'Você' : primeiroNome(reserva.usuario.nome)}
                          </div>
                          <div className="agenda-faixa-destino">{reserva.destino}</div>
                        </div>
                      ) : podeReservar(diaMovel) ? (
                        <button
                          type="button"
                          className="agenda-faixa-livre"
                          onClick={() => reservar(v, diaMovel, turno)}
                        >
                          Livre · reservar
                        </button>
                      ) : (
                        <span className="agenda-faixa-fechada">Indisponível</span>
                      )}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </>
      )}

      {popover && reservaAberta && (
        <div
          data-agenda-popover
          role="dialog"
          aria-label={`Reserva de ${reservaAberta.usuario.nome}`}
          className="agenda-popover"
          style={{
            left: popover.esquerda,
            top: popover.topo,
            width: LARGURA_POPOVER,
            transform: popover.acima ? 'translateY(-100%)' : undefined,
          }}
        >
          <div className="agenda-popover-titulo">
            {reservaAberta.usuario.nome} · {diaComSemana(reservaAberta.data)},{' '}
            {ROTULO_TURNO[reservaAberta.turno].toLowerCase()}
          </div>
          <div className="agenda-popover-destino">Destino: {reservaAberta.destino}</div>
          <div className="agenda-popover-veiculo">
            {reservaAberta.veiculo.modelo} · {reservaAberta.veiculo.placa}
          </div>
        </div>
      )}
    </div>
  );
}
