import {
  novaReservaSchema,
  ROTULO_TURNO,
  TURNOS,
  type Reserva,
  type Turno,
  type VeiculoDisponivel,
} from '@gve/shared';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, ErroApi } from '../../api';
import { useToast } from '../../toast/contexto';

function mensagemDe(erro: unknown): string {
  return erro instanceof ErroApi ? erro.message : 'Erro inesperado. Tente novamente.';
}

/** 'YYYY-MM-DD' → 'seg, 20/10'. A data é só dia, então formata em UTC para não deslocar. */
function formatarData(data: string): string {
  const d = new Date(`${data}T00:00:00.000Z`);
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(d);
}

export function NovaReserva() {
  const navegar = useNavigate();
  const toast = useToast();

  const [passo, setPasso] = useState<1 | 2 | 3>(1);
  const [datas, setDatas] = useState<string[] | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);

  const [data, setData] = useState('');
  const [turno, setTurno] = useState<Turno | ''>('');

  const [veiculos, setVeiculos] = useState<VeiculoDisponivel[] | undefined>(undefined);
  const [veiculoId, setVeiculoId] = useState<number | null>(null);
  const [destino, setDestino] = useState('');

  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api<{ datas: string[] }>('/reservas/datas-permitidas')
      .then((r) => setDatas(r.datas))
      .catch((e) => setErro(mensagemDe(e)));
  }, []);

  const veiculoEscolhido = veiculos?.find((v) => v.id === veiculoId);

  /** Busca a disponibilidade da data/turno escolhidos (não mexe na mensagem de erro). */
  async function carregarDisponibilidade() {
    setVeiculos(undefined);
    setVeiculoId(null);
    try {
      const url = `/reservas/disponibilidade?data=${encodeURIComponent(data)}&turno=${turno}`;
      const resp = await api<{ veiculos: VeiculoDisponivel[] }>(url);
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
      <div className="passos" aria-hidden="true">
        <span className={passo === 1 ? 'ativo' : undefined}>1. Data</span>
        <span className={passo === 2 ? 'ativo' : undefined}>2. Veículo</span>
        <span className={passo === 3 ? 'ativo' : undefined}>3. Confirmar</span>
      </div>

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      {passo === 1 && (
        <section className="cartao pilha">
          <label className="rotulo">
            Data
            {datas === undefined ? (
              <div className="vazio" role="status">
                Carregando datas…
              </div>
            ) : datas.length === 0 ? (
              <div className="vazio">Nenhuma data disponível nos próximos dias.</div>
            ) : (
              <select className="campo" value={data} onChange={(e) => setData(e.target.value)}>
                <option value="">Selecione…</option>
                {datas.map((d) => (
                  <option key={d} value={d}>
                    {formatarData(d)}
                  </option>
                ))}
              </select>
            )}
          </label>

          <div className="rotulo">
            Turno
            <div className="segmentado">
              {TURNOS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={turno === t ? 'segmentado-opcao ativa' : 'segmentado-opcao'}
                  aria-pressed={turno === t}
                  onClick={() => setTurno(t)}
                >
                  {ROTULO_TURNO[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="acoes">
            <button
              type="button"
              className="botao"
              disabled={!data || !turno}
              onClick={() => void irParaVeiculos()}
            >
              Continuar
            </button>
          </div>
        </section>
      )}

      {passo === 2 && (
        <section className="cartao pilha">
          <div className="texto-suave">
            {formatarData(data)} · {turno && ROTULO_TURNO[turno]}
          </div>

          <div className="rotulo">
            Veículo
            {veiculos === undefined ? (
              <div className="vazio" role="status">
                Carregando veículos…
              </div>
            ) : veiculos.length === 0 ? (
              <div className="vazio">Nenhum veículo cadastrado.</div>
            ) : (
              <ul className="lista-escolha">
                {veiculos.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      className={v.id === veiculoId ? 'escolha ativa' : 'escolha'}
                      disabled={v.ocupado}
                      aria-pressed={v.id === veiculoId}
                      onClick={() => setVeiculoId(v.id)}
                    >
                      <span>
                        <strong>{v.modelo}</strong> · {v.placa}
                      </span>
                      {v.ocupado && <span className="escolha-ocupado">Ocupado</span>}
                    </button>
                  </li>
                ))}
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

          <div className="acoes">
            <button
              type="button"
              className="botao"
              disabled={veiculoId === null || destino.trim() === ''}
              onClick={irParaConfirmar}
            >
              Continuar
            </button>
            <button type="button" className="botao-link" onClick={() => setPasso(1)}>
              Voltar
            </button>
          </div>
        </section>
      )}

      {passo === 3 && (
        <section className="cartao pilha">
          <div className="resumo">
            <div className="resumo-linha">
              <span className="resumo-rotulo">Data</span>
              <span>{formatarData(data)}</span>
            </div>
            <div className="resumo-linha">
              <span className="resumo-rotulo">Turno</span>
              <span>{turno && ROTULO_TURNO[turno]}</span>
            </div>
            <div className="resumo-linha">
              <span className="resumo-rotulo">Veículo</span>
              <span>
                {veiculoEscolhido ? `${veiculoEscolhido.modelo} · ${veiculoEscolhido.placa}` : '—'}
              </span>
            </div>
            <div className="resumo-linha">
              <span className="resumo-rotulo">Destino</span>
              <span>{destino}</span>
            </div>
          </div>

          <div className="acoes">
            <button
              type="button"
              className="botao"
              disabled={enviando}
              onClick={() => void confirmar()}
            >
              {enviando ? 'Reservando…' : 'Confirmar reserva'}
            </button>
            <button
              type="button"
              className="botao-link"
              disabled={enviando}
              onClick={() => setPasso(2)}
            >
              Voltar
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
