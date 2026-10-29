import { ROTULO_TURNO, veiculoSchema, type ReservaAfetada, type Veiculo } from '@gve/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ErroApi } from '../../api';
import { dataComSemana } from '../../datas';
import { useToast } from '../../toast/contexto';

function mensagemDe(erro: unknown): string {
  return erro instanceof ErroApi ? erro.message : 'Erro inesperado. Tente novamente.';
}

/** ABC1234 → ABC-1234 · ABC1D23 → ABC-1D23, como aparece na placa. */
function placaComHifen(placa: string): string {
  return `${placa.slice(0, 3)}-${placa.slice(3)}`;
}

function textoReservas(n: number): string {
  return `${n} ${n === 1 ? 'reserva futura' : 'reservas futuras'}`;
}

interface PropsForm {
  inicial?: Veiculo;
  textoBotao: string;
  aoSalvar(veiculo: Veiculo): void;
  aoCancelar?(): void;
}

/** Modelo e placa (formatos antigo e Mercosul), no cadastro e na edição. */
function FormVeiculo({ inicial, textoBotao, aoSalvar, aoCancelar }: PropsForm) {
  const [modelo, setModelo] = useState(inicial?.modelo ?? '');
  const [placa, setPlaca] = useState(inicial?.placa ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    const validacao = veiculoSchema.safeParse({ placa, modelo });
    if (!validacao.success) {
      setErro(validacao.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }

    setEnviando(true);
    try {
      const r = await api<{ veiculo: Veiculo }>(inicial ? `/veiculos/${inicial.id}` : '/veiculos', {
        metodo: inicial ? 'PUT' : 'POST',
        corpo: validacao.data,
      });
      aoSalvar(r.veiculo);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="form-veiculo" onSubmit={enviar} noValidate>
      <input
        className="campo"
        type="text"
        placeholder="Modelo (ex.: Fiat Mobi)"
        aria-label="Modelo"
        autoComplete="off"
        value={modelo}
        onChange={(e) => setModelo(e.target.value)}
      />
      <input
        className="campo campo-placa"
        type="text"
        placeholder="Placa"
        aria-label="Placa"
        autoCapitalize="characters"
        autoComplete="off"
        maxLength={8}
        value={placa}
        onChange={(e) => setPlaca(e.target.value)}
      />
      <button type="submit" className="veiculo-salvar" disabled={enviando}>
        {enviando ? 'Salvando…' : textoBotao}
      </button>
      {aoCancelar && (
        <button type="button" className="botao-link" onClick={aoCancelar}>
          Cancelar
        </button>
      )}
      {erro && (
        <p className="erro form-veiculo-erro" role="alert">
          {erro}
        </p>
      )}
    </form>
  );
}

interface Desativacao {
  veiculo: Veiculo;
  /** Reservas que serão canceladas; indefinido enquanto carrega. */
  reservas?: ReservaAfetada[];
  erro?: string;
}

interface PropsModal {
  desativacao: Desativacao;
  confirmando: boolean;
  aoConfirmar(): void;
  aoVoltar(): void;
}

/** Confirmação da desativação, com a lista das reservas futuras que serão canceladas (RN10). */
function ModalDesativar({ desativacao, confirmando, aoConfirmar, aoVoltar }: PropsModal) {
  const { veiculo, reservas, erro } = desativacao;

  useEffect(() => {
    const aoApertar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoVoltar();
    };
    window.addEventListener('keydown', aoApertar);
    return () => window.removeEventListener('keydown', aoApertar);
  }, [aoVoltar]);

  const n = reservas?.length ?? 0;
  return (
    <div
      className="modal-fundo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoVoltar();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-desativar">
        <h2 id="titulo-desativar" className="modal-titulo">
          Desativar {veiculo.modelo} · {placaComHifen(veiculo.placa)}?
        </h2>

        {erro ? (
          <p className="erro" role="alert">
            {erro}
          </p>
        ) : reservas === undefined ? (
          <p className="modal-texto" role="status">
            Verificando as reservas futuras…
          </p>
        ) : n === 0 ? (
          <p className="modal-texto">
            Este veículo não tem reservas futuras. Ele deixa de aparecer para novas reservas e
            continua no histórico.
          </p>
        ) : (
          <>
            <p className="modal-texto">
              {n === 1
                ? 'A reserva abaixo será cancelada'
                : `As ${n} reservas abaixo serão canceladas`}
              . Os servidores a verão como cancelada em &ldquo;Minhas reservas&rdquo;. O veículo
              deixa de aparecer para novas reservas e continua no histórico.
            </p>
            <ul className="modal-lista" aria-label="Reservas que serão canceladas">
              {reservas.map((r) => (
                <li key={r.id} className="modal-item">
                  <span className="modal-item-quando">
                    {dataComSemana(r.data)} · {ROTULO_TURNO[r.turno]}
                  </span>
                  <span className="modal-item-quem">
                    {r.usuario.nome} — {r.destino}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="modal-acoes">
          <button type="button" className="botao-borda botao-grande" autoFocus onClick={aoVoltar}>
            Voltar
          </button>
          <button
            type="button"
            className="botao-perigo-cheio"
            disabled={reservas === undefined || confirmando}
            onClick={aoConfirmar}
          >
            {confirmando
              ? 'Desativando…'
              : n > 0
                ? `Desativar e cancelar ${n === 1 ? '1 reserva' : `${n} reservas`}`
                : 'Desativar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Frota da secretaria (RF05): cadastro, edição e desativação (RN10). Só o administrador. */
export function Veiculos() {
  const toast = useToast();
  const [veiculos, setVeiculos] = useState<Veiculo[] | undefined>(undefined);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [desativacao, setDesativacao] = useState<Desativacao | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    api<{ veiculos: Veiculo[] }>('/veiculos')
      .then((r) => setVeiculos(r.veiculos))
      .catch((e) => setErroCarga(mensagemDe(e)));
  }, []);

  function substituir(veiculo: Veiculo) {
    setVeiculos((lista) =>
      lista?.map((v) =>
        // Editar não devolve a contagem de reservas: mantém a que a tela já tinha.
        v.id === veiculo.id
          ? { ...veiculo, reservasFuturas: veiculo.reservasFuturas ?? v.reservasFuturas }
          : v,
      ),
    );
  }

  /** Abre a confirmação e busca as reservas que a desativação vai cancelar. */
  function pedirDesativacao(veiculo: Veiculo) {
    setDesativacao({ veiculo });
    api<{ reservas: ReservaAfetada[] }>(`/veiculos/${veiculo.id}/reservas-futuras`)
      .then((r) =>
        setDesativacao((atual) =>
          atual?.veiculo.id === veiculo.id ? { veiculo, reservas: r.reservas } : atual,
        ),
      )
      .catch((e) =>
        setDesativacao((atual) =>
          atual?.veiculo.id === veiculo.id ? { veiculo, erro: mensagemDe(e) } : atual,
        ),
      );
  }

  async function confirmarDesativacao() {
    if (!desativacao) return;
    setConfirmando(true);
    try {
      const r = await api<{ veiculo: Veiculo; reservasCanceladas: ReservaAfetada[] }>(
        `/veiculos/${desativacao.veiculo.id}/situacao`,
        { metodo: 'PATCH', corpo: { ativo: false } },
      );
      substituir(r.veiculo);
      setDesativacao(null);
      const n = r.reservasCanceladas.length;
      toast(
        n === 0
          ? 'Veículo desativado.'
          : `Veículo desativado. ${n === 1 ? '1 reserva cancelada' : `${n} reservas canceladas`}.`,
      );
    } catch (e) {
      setDesativacao((atual) => (atual ? { ...atual, erro: mensagemDe(e) } : atual));
    } finally {
      setConfirmando(false);
    }
  }

  async function reativar(veiculo: Veiculo) {
    try {
      const r = await api<{ veiculo: Veiculo }>(`/veiculos/${veiculo.id}/situacao`, {
        metodo: 'PATCH',
        corpo: { ativo: true },
      });
      substituir(r.veiculo);
      toast('Veículo reativado.');
    } catch (e) {
      toast(mensagemDe(e));
    }
  }

  return (
    <div className="pagina pagina-veiculos">
      <div className="pagina-topo">
        <h1 className="titulo-pagina">Veículos</h1>
        <button
          type="button"
          className="botao botao-cadastrar-veiculo"
          onClick={() => setCadastrando((v) => !v)}
        >
          {cadastrando ? 'Fechar' : '+ Cadastrar veículo'}
        </button>
      </div>

      {cadastrando && (
        <div className="veiculo-cartao-form">
          <FormVeiculo
            textoBotao="Salvar"
            aoSalvar={(veiculo) => {
              setVeiculos((lista) => [veiculo, ...(lista ?? [])]);
              setCadastrando(false);
              toast('Veículo cadastrado.');
            }}
            aoCancelar={() => setCadastrando(false)}
          />
        </div>
      )}

      {erroCarga ? (
        <p className="erro" role="alert">
          {erroCarga}
        </p>
      ) : veiculos === undefined ? (
        <div className="vazio" role="status">
          Carregando…
        </div>
      ) : veiculos.length === 0 ? (
        <div className="vazio">Nenhum veículo cadastrado.</div>
      ) : (
        <ul className="grade-veiculos">
          {veiculos.map((veiculo) =>
            editando === veiculo.id ? (
              <li
                key={veiculo.id}
                className="veiculo-cartao-form veiculo-edicao"
                aria-label={`Editar ${veiculo.modelo} ${veiculo.placa}`}
              >
                <FormVeiculo
                  inicial={veiculo}
                  textoBotao="Salvar"
                  aoSalvar={(editado) => {
                    substituir(editado);
                    setEditando(null);
                    toast('Veículo atualizado.');
                  }}
                  aoCancelar={() => setEditando(null)}
                />
              </li>
            ) : (
              <li
                key={veiculo.id}
                className={veiculo.ativo ? 'veiculo-cartao' : 'veiculo-cartao inativo'}
                aria-label={`${veiculo.modelo} ${veiculo.placa}`}
              >
                <div className="veiculo-topo">
                  <div className="veiculo-modelo">{veiculo.modelo}</div>
                  <span className={veiculo.ativo ? 'veiculo-situacao ativo' : 'veiculo-situacao'}>
                    {veiculo.ativo ? 'Ativo' : 'Desativado'}
                  </span>
                </div>
                <div className="veiculo-placa">{placaComHifen(veiculo.placa)}</div>
                <div className="veiculo-rodape">
                  <span className="veiculo-uso">{textoReservas(veiculo.reservasFuturas ?? 0)}</span>
                  <div className="veiculo-acoes">
                    <button
                      type="button"
                      className="botao-borda botao-pequeno"
                      onClick={() => setEditando(veiculo.id)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="botao-borda botao-pequeno"
                      onClick={() =>
                        veiculo.ativo ? pedirDesativacao(veiculo) : void reativar(veiculo)
                      }
                    >
                      {veiculo.ativo ? 'Desativar' : 'Reativar'}
                    </button>
                  </div>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      {desativacao && (
        <ModalDesativar
          desativacao={desativacao}
          confirmando={confirmando}
          aoConfirmar={() => void confirmarDesativacao()}
          aoVoltar={() => !confirmando && setDesativacao(null)}
        />
      )}
    </div>
  );
}
