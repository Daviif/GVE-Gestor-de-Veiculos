import {
  novaReservaSchema,
  ROTULO_TURNO,
  TURNOS,
  type Reserva,
  type Turno,
  type VeiculoDisponivel,
} from '@gve/shared';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api, ErroApi } from '../../api';
import { dataLonga, diaComSemana } from '../../datas';
import { useToast } from '../../toast/contexto';

/** Escolha vinda da agenda ("+ reservar" numa célula livre): abre direto no passo 2. */
export interface PreenchimentoReserva {
  data: string;
  turno: Turno;
  veiculoId: number;
}

function lerPreenchimento(state: unknown): PreenchimentoReserva | null {
  if (typeof state !== 'object' || state === null) return null;
  const { data, turno, veiculoId } = state as Record<string, unknown>;
  if (typeof data !== 'string' || typeof veiculoId !== 'number') return null;
  if (turno !== 'MATUTINO' && turno !== 'VESPERTINO') return null;
  return { data, turno, veiculoId };
}

function urlDisponibilidade(data: string, turno: string): string {
  return `/reservas/disponibilidade?data=${encodeURIComponent(data)}&turno=${turno}`;
}

/** Horário de referência de cada turno, só para a UI (as regras ficam no back). */
const HORARIO_TURNO: Record<Turno, string> = {
  MATUTINO: '7h às 12h',
  VESPERTINO: '13h às 18h',
};

function mensagemDe(erro: unknown): string {
  return erro instanceof ErroApi ? erro.message : 'Erro inesperado. Tente novamente.';
}

/** 'YYYY-MM-DD' → 'Seg\n14/10'. Dividido em duas linhas no botão. */
function dowCurto(data: string): string {
  const d = new Date(`${data}T00:00:00.000Z`);
  const dow = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
    .format(d)
    .replace(/\./g, '');
  return dow.charAt(0).toUpperCase() + dow.slice(1);
}

function diaMes(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

export function NovaReserva() {
  const navegar = useNavigate();
  const local = useLocation();
  const toast = useToast();

  // Lido uma vez, na abertura: quem veio da agenda já traz data, turno e veículo.
  const [pre] = useState(() => lerPreenchimento(local.state));

  const [passo, setPasso] = useState<1 | 2 | 3>(pre ? 2 : 1);
  const [datas, setDatas] = useState<string[] | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);

  const [data, setData] = useState(pre?.data ?? '');
  const [turno, setTurno] = useState<Turno | ''>(pre?.turno ?? '');

  const [veiculos, setVeiculos] = useState<VeiculoDisponivel[] | undefined>(undefined);
  const [veiculoId, setVeiculoId] = useState<number | null>(pre?.veiculoId ?? null);
  const [destino, setDestino] = useState('');

  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api<{ datas: string[] }>('/reservas/datas-permitidas')
      .then((r) => setDatas(r.datas))
      .catch((e) => setErro(mensagemDe(e)));
  }, []);

  // Com preenchimento, já carrega os veículos da data/turno trazidos pela agenda. Se o carro
  // escolhido foi reservado nesse meio-tempo, a escolha é desfeita.
  useEffect(() => {
    if (!pre) return;
    let ativo = true;
    api<{ veiculos: VeiculoDisponivel[] }>(urlDisponibilidade(pre.data, pre.turno))
      .then((r) => {
        if (!ativo) return;
        setVeiculos(r.veiculos);
        setVeiculoId((atual) =>
          r.veiculos.some((v) => v.id === atual && !v.ocupado) ? atual : null,
        );
      })
      .catch((e) => {
        if (!ativo) return;
        setErro(mensagemDe(e));
        setVeiculos([]);
        setVeiculoId(null);
      });
    return () => {
      ativo = false;
    };
  }, [pre]);

  const veiculoEscolhido = veiculos?.find((v) => v.id === veiculoId);

  /** Busca a disponibilidade da data/turno escolhidos (não mexe na mensagem de erro). */
  async function carregarDisponibilidade() {
    setVeiculos(undefined);
    setVeiculoId(null);
    try {
      const resp = await api<{ veiculos: VeiculoDisponivel[] }>(urlDisponibilidade(data, turno));
      setVeiculos(resp.veiculos);
    } catch (e) {
      setErro(mensagemDe(e));
      setVeiculos([]);
    }
  }

  /** Vai para o passo 2, carregando os veículos. */
  async function irParaVeiculos() {
    setErro(null);
    if (!data || !turno) {
      setErro('Escolha a data e o turno.');
      return;
    }
    setPasso(2);
    await carregarDisponibilidade();
  }

  function irParaConfirmar() {
    setErro(null);
    const validacao = novaReservaSchema.safeParse({ data, turno, veiculoId, destino });
    if (!validacao.success) {
      setErro(validacao.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    setPasso(3);
  }

  async function confirmar() {
    setErro(null);
    const validacao = novaReservaSchema.safeParse({ data, turno, veiculoId, destino });
    if (!validacao.success) {
      setErro(validacao.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    setEnviando(true);
    try {
      await api<{ reserva: Reserva }>('/reservas', { metodo: 'POST', corpo: validacao.data });
      toast('Reserva criada.');
      navegar('/');
    } catch (e) {
      setEnviando(false);
      if (e instanceof ErroApi && e.codigo === 'CONFLITO_RESERVA') {
        // Alguém reservou esse carro primeiro: volta para a escolha com a lista atualizada.
        setPasso(2);
        await carregarDisponibilidade();
        setErro(e.message);
        return;
      }
      setErro(mensagemDe(e));
    }
  }

  return (
    <div className="pagina pagina-estreita">
      <h1 className="titulo-pagina">Nova reserva</h1>
      <div className="passos-barra" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <div key={n} className="passo">
            <div className={n <= passo ? 'passo-barra ativa' : 'passo-barra'} />
            <div className={n <= passo ? 'passo-rotulo ativo' : 'passo-rotulo'}>
              {n}. {n === 1 ? 'Data e turno' : n === 2 ? 'Veículo e destino' : 'Confirmação'}
            </div>
          </div>
        ))}
      </div>

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      {passo === 1 && (
        <section className="pilha">
          <div className="rotulo">
            Data
            {datas === undefined ? (
              <div className="vazio" role="status">
                Carregando datas…
              </div>
            ) : datas.length === 0 ? (
              <div className="vazio">Nenhuma data disponível nos próximos dias.</div>
            ) : (
              <div className="grid-datas" role="radiogroup" aria-label="Data da reserva">
                {datas.map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={data === d}
                    className={data === d ? 'botao-data ativo' : 'botao-data'}
                    onClick={() => setData(d)}
                  >
                    <span className="botao-data-dow">{dowCurto(d)}</span>
                    <span className="botao-data-dm">{diaMes(d)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rotulo">
            Turno
            <div className="segmentado-turno">
              {TURNOS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={turno === t ? 'turno-cartao ativo' : 'turno-cartao'}
                  aria-pressed={turno === t}
                  onClick={() => setTurno(t)}
                >
                  <span className="turno-nome">{ROTULO_TURNO[t]}</span>
                  <span className="turno-horario">{HORARIO_TURNO[t]}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="botao botao-grande"
            disabled={!data || !turno}
            onClick={() => void irParaVeiculos()}
          >
            Continuar
          </button>
        </section>
      )}

      {passo === 2 && (
        <section className="pilha">
          <div className="selecao-topo">
            <span className="selecao-rotulo">
              {diaComSemana(data)} · {turno && ROTULO_TURNO[turno]}
            </span>
            <button type="button" className="botao-link" onClick={() => setPasso(1)}>
              Alterar
            </button>
          </div>

          <div className="rotulo">
            Escolha o veículo
            {veiculos === undefined ? (
              <div className="vazio" role="status">
                Carregando veículos…
              </div>
            ) : veiculos.length === 0 ? (
              <div className="vazio">Nenhum veículo cadastrado.</div>
            ) : (
              <ul className="lista-escolha">
                {veiculos.map((v) => {
                  const selecionado = v.id === veiculoId;
                  if (v.ocupado) {
                    return (
                      <li key={v.id} className="escolha-indisponivel" aria-disabled="true">
                        <span className="radio-circulo" aria-hidden="true" />
                        <span className="escolha-nome">
                          <strong>{v.modelo}</strong> · {v.placa}
                        </span>
                        <span className="escolha-ocupado">Ocupado</span>
                      </li>
                    );
                  }
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selecionado}
                        className={selecionado ? 'escolha-livre ativa' : 'escolha-livre'}
                        onClick={() => setVeiculoId(v.id)}
                      >
                        <span className="radio-circulo" aria-hidden="true">
                          {selecionado && <span className="radio-ponto" />}
                        </span>
                        <span className="escolha-nome">
                          <strong>{v.modelo}</strong> · {v.placa}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <label className="rotulo">
            Destino
            <input
              className="campo"
              type="text"
              maxLength={200}
              placeholder="Ex.: Escola Municipal Santa Rita"
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
            />
          </label>

          <button
            type="button"
            className="botao botao-grande"
            disabled={veiculoId === null || destino.trim() === ''}
            onClick={irParaConfirmar}
          >
            Continuar
          </button>
        </section>
      )}

      {passo === 3 && (
        <section className="pilha">
          <div className="cartao-confirmacao">
            <div className="cartao-confirmacao-topo">
              <div className="cartao-confirmacao-rotulo">Confira sua reserva</div>
              <div className="cartao-confirmacao-titulo">
                {dataLonga(data)} · {turno && ROTULO_TURNO[turno]}
              </div>
            </div>
            <div className="cartao-confirmacao-corpo">
              <div className="resumo-linha">
                <span className="resumo-rotulo">Veículo</span>
                <span>
                  {veiculoEscolhido
                    ? `${veiculoEscolhido.modelo} · ${veiculoEscolhido.placa}`
                    : '—'}
                </span>
              </div>
              <div className="resumo-linha">
                <span className="resumo-rotulo">Destino</span>
                <span>{destino}</span>
              </div>
            </div>
          </div>

          <div className="acoes-confirmar">
            <button
              type="button"
              className="botao-borda botao-grande botao-voltar"
              disabled={enviando}
              onClick={() => setPasso(2)}
            >
              Voltar
            </button>
            <button
              type="button"
              className="botao-confirmar"
              disabled={enviando}
              onClick={() => void confirmar()}
            >
              {enviando ? 'Reservando…' : 'Confirmar reserva'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
