import {
  ABRANGENCIAS,
  feriadoSchema,
  ROTULO_ABRANGENCIA,
  type Abrangencia,
  type Feriado,
} from '@gve/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ErroApi } from '../../api';
import { useErrosDeCampo } from '../../componentes/errosDeCampo';
import { useToast } from '../../toast/contexto';
import { anoAtual, dataCurta, diaDaSemana, diaMes } from '../../datas';

function mensagemDe(erro: unknown): string {
  return erro instanceof ErroApi ? erro.message : 'Erro inesperado. Tente novamente.';
}

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** RN11: o feriado não cancela as reservas da data; o administrador precisa saber delas. */
function avisoReservas(feriados: Feriado[]): string | null {
  const comReservas = feriados.filter((f) => f.reservasAtivas > 0);
  if (comReservas.length === 0) return null;
  const datas = comReservas
    .map((f) => `${dataCurta(f.data)} (${plural(f.reservasAtivas, 'reserva', 'reservas')})`)
    .join(', ');
  return `Já existem reservas ativas em ${datas}. Elas não foram canceladas: avise os servidores ou cancele-as.`;
}

function porData(a: Feriado, b: Feriado): number {
  return a.data.localeCompare(b.data);
}

/** Data, nome e abrangência de um novo feriado, numa linha só. */
function FormFeriado({ aoSalvar }: { aoSalvar(feriado: Feriado): void }) {
  const [data, setData] = useState('');
  const [descricao, setDescricao] = useState('');
  const [abrangencia, setAbrangencia] = useState<Abrangencia>('MUNICIPAL');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campos = useErrosDeCampo();

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    setErro(null);
    campos.limpar();

    const validacao = feriadoSchema.safeParse({ data, descricao, abrangencia });
    if (!validacao.success) {
      campos.deValidacao(form, validacao.error);
      return;
    }

    setEnviando(true);
    try {
      const r = await api<{ feriado: Feriado }>('/feriados', {
        metodo: 'POST',
        corpo: validacao.data,
      });
      setData('');
      setDescricao('');
      aoSalvar(r.feriado);
    } catch (e) {
      if (!campos.deApi(form, e)) setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cartao pilha" onSubmit={enviar} noValidate aria-label="Novo feriado">
      <div className="form-linha">
        <div className="campo-grupo campo-data">
          <input
            className="campo"
            type="date"
            aria-label="Data"
            value={data}
            onChange={(e) => setData(e.target.value)}
            {...campos.props('data')}
          />
          {campos.mensagem('data')}
        </div>
        <div className="campo-grupo campo-nome">
          <input
            className="campo"
            type="text"
            autoComplete="off"
            placeholder="Nome do feriado"
            aria-label="Nome do feriado"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            {...campos.props('descricao')}
          />
          {campos.mensagem('descricao')}
        </div>
        <div className="campo-grupo campo-abrangencia">
          <select
            className="campo"
            aria-label="Abrangência"
            value={abrangencia}
            onChange={(e) => setAbrangencia(e.target.value as Abrangencia)}
            {...campos.props('abrangencia')}
          >
            {ABRANGENCIAS.map((a) => (
              <option key={a} value={a}>
                {ROTULO_ABRANGENCIA[a]}
              </option>
            ))}
          </select>
          {campos.mensagem('abrangencia')}
        </div>
        <button type="submit" className="botao" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Cadastrar'}
        </button>
      </div>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
    </form>
  );
}

/** Feriados (RF17, RN11): dias em que o sistema não aceita reservas. */
export function Feriados() {
  const toast = useToast();
  const [ano, setAno] = useState(anoAtual);
  // Guarda de qual ano é a lista: ao trocar de ano, a antiga some até a nova chegar.
  const [carregado, setCarregado] = useState<{ ano: number; feriados: Feriado[] } | null>(null);
  const [erroCarga, setErroCarga] = useState<{ ano: number; mensagem: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);

  useEffect(() => {
    let ativo = true;
    api<{ feriados: Feriado[] }>(`/feriados?ano=${ano}`)
      .then((r) => {
        if (!ativo) return;
        setCarregado({ ano, feriados: r.feriados });
        setErroCarga(null);
      })
      .catch((e) => {
        if (ativo) setErroCarga({ ano, mensagem: mensagemDe(e) });
      });
    // Trocar de ano antes da resposta chegar não deixa a lista antiga sobrescrever a nova.
    return () => {
      ativo = false;
    };
  }, [ano]);

  const feriados = carregado?.ano === ano ? carregado.feriados : undefined;
  const erroDoAno = erroCarga?.ano === ano ? erroCarga.mensagem : null;

  /** Muda a lista carregada; `anoDaLista` é o dela agora, não o de quando a ação começou. */
  function atualizar(mudar: (lista: Feriado[], anoDaLista: number) => Feriado[]) {
    setCarregado((atual) => atual && { ...atual, feriados: mudar(atual.feriados, atual.ano) });
  }

  /**
   * Junta os novos à lista, se forem do ano dela. Compara com o ano da lista na hora da resposta:
   * o administrador pode ter trocado de ano enquanto a importação ou o cadastro estava em curso.
   */
  function incluir(novos: Feriado[]) {
    atualizar((lista, anoDaLista) => {
      const doAno = novos.filter((f) => f.data.startsWith(`${anoDaLista}-`));
      return doAno.length === 0 ? lista : [...lista, ...doAno].sort(porData);
    });
  }

  async function importar() {
    setImportando(true);
    try {
      const r = await api<{ importados: Feriado[]; ignorados: number }>('/feriados/importar', {
        metodo: 'POST',
        corpo: { ano },
      });
      incluir(r.importados);
      setAviso(avisoReservas(r.importados));
      toast(
        r.importados.length === 0
          ? `Os feriados nacionais de ${ano} já estavam cadastrados.`
          : `${plural(r.importados.length, 'feriado nacional importado', 'feriados nacionais importados')} em ${ano}.`,
      );
    } catch (e) {
      toast(mensagemDe(e));
    } finally {
      setImportando(false);
    }
  }

  async function excluir(feriado: Feriado) {
    if (
      !window.confirm(
        `Excluir o feriado ${feriado.descricao} (${dataCurta(feriado.data)})? A data volta a aceitar reservas.`,
      )
    ) {
      return;
    }
    try {
      await api(`/feriados/${feriado.id}`, { metodo: 'DELETE' });
      atualizar((lista) => lista.filter((f) => f.id !== feriado.id));
      toast('Feriado excluído.');
    } catch (e) {
      toast(mensagemDe(e));
    }
  }

  return (
    <div className="pagina pagina-media">
      <div className="pilha-curta">
        <div className="pagina-topo">
          <h1 className="titulo-pagina">Feriados</h1>
          <button
            type="button"
            className="botao-secundario"
            disabled={importando}
            onClick={() => void importar()}
          >
            {importando ? 'Importando…' : 'Importar feriados nacionais'}
          </button>
        </div>
        <p className="texto-suave">Em feriados nenhum veículo pode ser reservado.</p>
      </div>

      {aviso && (
        <div className="destaque-aviso" role="alert">
          <div>{aviso}</div>
          <button type="button" className="botao-link" onClick={() => setAviso(null)}>
            Fechar
          </button>
        </div>
      )}

      <FormFeriado
        aoSalvar={(feriado) => {
          incluir([feriado]);
          setAviso(avisoReservas([feriado]));
          toast(
            feriado.data.startsWith(`${ano}-`)
              ? 'Feriado cadastrado.'
              : `Feriado cadastrado em ${dataCurta(feriado.data)}.`,
          );
        }}
      />

      <section className="pilha-curta" aria-labelledby="titulo-lista-feriados">
        <div className="navegacao-ano">
          <button
            type="button"
            className="botao-borda botao-pequeno"
            aria-label="Ano anterior"
            onClick={() => setAno((a) => a - 1)}
          >
            ←
          </button>
          <h2 id="titulo-lista-feriados" className="rotulo-lista">
            Feriados de {ano}
          </h2>
          <button
            type="button"
            className="botao-borda botao-pequeno"
            aria-label="Próximo ano"
            onClick={() => setAno((a) => a + 1)}
          >
            →
          </button>
        </div>

        {erroDoAno ? (
          <p className="erro" role="alert">
            {erroDoAno}
          </p>
        ) : feriados === undefined ? (
          <div className="vazio" role="status">
            Carregando…
          </div>
        ) : feriados.length === 0 ? (
          <div className="vazio">
            Nenhum feriado cadastrado em {ano}. Importe os nacionais ou cadastre acima.
          </div>
        ) : (
          <ul className="lista-linhas">
            {feriados.map((feriado) => (
              <li
                key={feriado.id}
                className="linha"
                aria-label={`${feriado.descricao}, ${dataCurta(feriado.data)}`}
              >
                <div className="linha-data">
                  <div className="linha-data-dia">{diaMes(feriado.data)}</div>
                  <div className="linha-data-semana">{diaDaSemana(feriado.data)}</div>
                </div>
                <div className="linha-titulo">
                  {feriado.descricao}
                  <span className="etiqueta-perfil">{ROTULO_ABRANGENCIA[feriado.abrangencia]}</span>
                  {feriado.reservasAtivas > 0 && (
                    <span className="etiqueta etiqueta-aviso">
                      {plural(feriado.reservasAtivas, 'reserva ativa', 'reservas ativas')}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="botao-excluir"
                  onClick={() => void excluir(feriado)}
                >
                  Excluir
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
