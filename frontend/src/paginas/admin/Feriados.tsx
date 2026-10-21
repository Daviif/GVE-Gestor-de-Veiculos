import {
  ABRANGENCIAS,
  feriadoSchema,
  ROTULO_ABRANGENCIA,
  type Abrangencia,
  type Feriado,
} from '@gve/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ErroApi } from '../../api';
import { useToast } from '../../toast/contexto';

function mensagemDe(erro: unknown): string {
  return erro instanceof ErroApi ? erro.message : 'Erro inesperado. Tente novamente.';
}

/** Formata 'YYYY-MM-DD' em UTC (data pura, sem hora). */
function formatar(data: string, opcoes: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('pt-BR', { ...opcoes, timeZone: 'UTC' }).format(
    new Date(`${data}T00:00:00.000Z`),
  );
}

/** '2026-10-12' → '12/10/2026'. */
function dataCompleta(data: string): string {
  return formatar(data, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** '2026-10-12' → 'Segunda'. */
function diaDaSemana(data: string): string {
  const dia = formatar(data, { weekday: 'long' }).split('-')[0]!;
  return dia.charAt(0).toUpperCase() + dia.slice(1);
}

function anoAtual(): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(
      new Date(),
    ),
  );
}

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** RN11: o feriado não cancela as reservas da data; o administrador precisa saber delas. */
function avisoReservas(feriados: Feriado[]): string | null {
  const comReservas = feriados.filter((f) => f.reservasAtivas > 0);
  if (comReservas.length === 0) return null;
  const datas = comReservas
    .map((f) => `${dataCompleta(f.data)} (${plural(f.reservasAtivas, 'reserva', 'reservas')})`)
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

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    const validacao = feriadoSchema.safeParse({ data, descricao, abrangencia });
    if (!validacao.success) {
      setErro(validacao.error.issues[0]?.message ?? 'Dados inválidos.');
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
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cartao pilha" onSubmit={enviar} noValidate aria-label="Novo feriado">
      <div className="form-linha">
        <input
          className="campo campo-data"
          type="date"
          aria-label="Data"
          value={data}
          onChange={(e) => setData(e.target.value)}
        />
        <input
          className="campo campo-nome"
          type="text"
          autoComplete="off"
          placeholder="Nome do feriado"
          aria-label="Nome do feriado"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
        <select
          className="campo campo-abrangencia"
          aria-label="Abrangência"
          value={abrangencia}
          onChange={(e) => setAbrangencia(e.target.value as Abrangencia)}
        >
          {ABRANGENCIAS.map((a) => (
            <option key={a} value={a}>
              {ROTULO_ABRANGENCIA[a]}
            </option>
          ))}
        </select>
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

  function atualizar(mudar: (lista: Feriado[]) => Feriado[]) {
    setCarregado((atual) => atual && { ...atual, feriados: mudar(atual.feriados) });
  }

  /** Junta os novos à lista, se forem do ano exibido. */
  function incluir(novos: Feriado[]) {
    const doAno = novos.filter((f) => f.data.startsWith(`${ano}-`));
    if (doAno.length > 0) atualizar((lista) => [...lista, ...doAno].sort(porData));
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
        `Excluir o feriado ${feriado.descricao} (${dataCompleta(feriado.data)})? A data volta a aceitar reservas.`,
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
              : `Feriado cadastrado em ${dataCompleta(feriado.data)}.`,
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
                aria-label={`${feriado.descricao}, ${dataCompleta(feriado.data)}`}
              >
                <div className="linha-data">
                  <div className="linha-data-dia">
                    {formatar(feriado.data, { day: '2-digit', month: '2-digit' })}
                  </div>
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
