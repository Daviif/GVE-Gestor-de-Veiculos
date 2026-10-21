import {
  HISTORICO_TAMANHO_PADRAO,
  ROTULO_TURNO,
  type ItemHistorico,
  type RespostaHistorico,
  type SituacaoHistorico,
  type Usuario,
  type VeiculoDisponivel,
} from '@gve/shared';
import { useEffect, useMemo, useState } from 'react';
import { api, ErroApi } from '../../api';

function mensagemDe(erro: unknown): string {
  return erro instanceof ErroApi ? erro.message : 'Erro inesperado. Tente novamente.';
}

/** 'YYYY-MM-DD' do dia atual em São Paulo. */
function hojeEmSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function somar(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function primeiroDoMes(data: string): string {
  return `${data.slice(0, 7)}-01`;
}

function ultimoDoMes(data: string): string {
  const d = new Date(`${data}T00:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

function nomeMes(data: string): string {
  const d = new Date(`${data}T00:00:00.000Z`);
  const nome = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

/** 'YYYY-MM-DD' → 'Seg 19/10/2026'. */
function formatarData(data: string): string {
  const d = new Date(`${data}T00:00:00.000Z`);
  const dow = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
    .format(d)
    .replace(/\./g, '');
  const dmy = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
  return `${dow.charAt(0).toUpperCase() + dow.slice(1)} ${dmy}`;
}

const ROTULO_SITUACAO: Record<SituacaoHistorico, string> = {
  AGENDADA: 'Agendada',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

const COR_SITUACAO: Record<SituacaoHistorico, string> = {
  AGENDADA: 'var(--azul)',
  CONCLUIDA: 'var(--texto-apagado)',
  CANCELADA: 'var(--vermelho)',
};

/** Opções do filtro de período (preset): os valores viram inicio/fim na API. */
type Periodo = 'TUDO' | 'MES' | 'PASSADAS' | 'FUTURAS';

function intervaloDe(periodo: Periodo, hoje: string): { inicio?: string; fim?: string } {
  if (periodo === 'MES') return { inicio: primeiroDoMes(hoje), fim: ultimoDoMes(hoje) };
  if (periodo === 'PASSADAS') return { fim: somar(hoje, -1) };
  if (periodo === 'FUTURAS') return { inicio: hoje };
  return {};
}

function montarQuery(
  periodo: Periodo,
  usuarioId: string,
  veiculoId: string,
  pagina: number,
  hoje: string,
): string {
  const params = new URLSearchParams();
  const { inicio, fim } = intervaloDe(periodo, hoje);
  if (inicio) params.set('inicio', inicio);
  if (fim) params.set('fim', fim);
  if (usuarioId) params.set('usuarioId', usuarioId);
  if (veiculoId) params.set('veiculoId', veiculoId);
  params.set('pagina', String(pagina));
  params.set('tamanho', String(HISTORICO_TAMANHO_PADRAO));
  return params.toString();
}

/** Histórico de reservas (RF16) com filtros por período, veículo e servidor. */
export function Historico() {
  const hoje = useMemo(() => hojeEmSP(), []);
  const [periodo, setPeriodo] = useState<Periodo>('TUDO');
  const [usuarioId, setUsuarioId] = useState('');
  const [veiculoId, setVeiculoId] = useState('');
  const [pagina, setPagina] = useState(1);

  const [carregado, setCarregado] = useState<{ chave: string; resposta: RespostaHistorico } | null>(
    null,
  );
  const [erro, setErro] = useState<string | null>(null);

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [veiculos, setVeiculos] = useState<VeiculoDisponivel[]>([]);

  const chave = useMemo(
    () => montarQuery(periodo, usuarioId, veiculoId, pagina, hoje),
    [periodo, usuarioId, veiculoId, pagina, hoje],
  );
  const carregando = carregado?.chave !== chave;

  // Qualquer mudança de filtro volta para a página 1 (sem resetar via effect).
  function trocarPeriodo(p: Periodo) {
    setPeriodo(p);
    setPagina(1);
  }
  function trocarUsuario(id: string) {
    setUsuarioId(id);
    setPagina(1);
  }
  function trocarVeiculo(id: string) {
    setVeiculoId(id);
    setPagina(1);
  }

  // Lista de servidores para o filtro.
  useEffect(() => {
    api<{ usuarios: Usuario[] }>('/usuarios')
      .then((r) => setUsuarios(r.usuarios))
      .catch(() => {
        /* o filtro de servidor pode ficar vazio sem travar a tela */
      });
  }, []);

  // Lista de veículos para o filtro. Enquanto a #13 não traz uma listagem
  // pública, aproveito /reservas/disponibilidade com uma data futura — ela já
  // devolve os veículos ativos (que são os que normalmente aparecem no histórico).
  useEffect(() => {
    const dataConsulta = somar(hoje, 7);
    const url = `/reservas/disponibilidade?data=${dataConsulta}&turno=MATUTINO`;
    api<{ veiculos: VeiculoDisponivel[] }>(url)
      .then((r) => setVeiculos(r.veiculos))
      .catch(() => {
        /* se não listar, o filtro mostra só "Todos" */
      });
  }, [hoje]);

  useEffect(() => {
    let ativo = true;
    api<RespostaHistorico>(`/historico?${chave}`)
      .then((r) => {
        if (!ativo) return;
        setCarregado({ chave, resposta: r });
        setErro(null);
      })
      .catch((e) => {
        if (ativo) setErro(mensagemDe(e));
      });
    return () => {
      ativo = false;
    };
  }, [chave]);

  const resposta = carregado?.resposta;
  const totalPaginas = resposta ? Math.max(1, Math.ceil(resposta.total / resposta.tamanho)) : 1;
  const paginaAtual = resposta?.pagina ?? pagina;
  const total = resposta?.total ?? 0;

  return (
    <div className="pagina pagina-historico">
      <h1 className="titulo-pagina">Histórico</h1>

      <div className="filtros-historico">
        <select
          className="campo"
          value={periodo}
          onChange={(e) => trocarPeriodo(e.target.value as Periodo)}
          aria-label="Período"
        >
          <option value="TUDO">Todo o período</option>
          <option value="MES">{nomeMes(hoje)}</option>
          <option value="PASSADAS">Já realizadas</option>
          <option value="FUTURAS">Agendadas</option>
        </select>

        <select
          className="campo"
          value={veiculoId}
          onChange={(e) => trocarVeiculo(e.target.value)}
          aria-label="Veículo"
        >
          <option value="">Todos os veículos</option>
          {veiculos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.modelo} · {v.placa}
            </option>
          ))}
        </select>

        <select
          className="campo"
          value={usuarioId}
          onChange={(e) => trocarUsuario(e.target.value)}
          aria-label="Servidor"
        >
          <option value="">Todos os servidores</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </select>
      </div>

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      <div className="historico-contagem">
        {carregando ? 'Carregando…' : `${total} ${total === 1 ? 'registro' : 'registros'}`}
      </div>

      {!carregando && resposta && resposta.itens.length === 0 ? (
        <div className="vazio">Nenhuma reserva encontrada para esses filtros.</div>
      ) : (
        <div className="historico-lista">
          {resposta?.itens.map((item) => (
            <LinhaHistorico key={item.id} item={item} />
          ))}
        </div>
      )}

      {totalPaginas > 1 && (
        <div className="paginacao">
          <span className="texto-suave">
            Página {paginaAtual} de {totalPaginas}
          </span>
          <div className="acoes">
            <button
              type="button"
              className="botao-borda botao-pequeno"
              disabled={paginaAtual <= 1}
              onClick={() => setPagina((p) => p - 1)}
            >
              ← Anterior
            </button>
            <button
              type="button"
              className="botao-borda botao-pequeno"
              disabled={paginaAtual >= totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LinhaHistorico({ item }: { item: ItemHistorico }) {
  return (
    <div className="historico-linha">
      <span className="historico-data">{formatarData(item.data)}</span>
      <span className="historico-turno">{ROTULO_TURNO[item.turno]}</span>
      <span className="historico-veic">
        {item.veiculo.modelo} · {item.veiculo.placa}
      </span>
      <span className="historico-user">{item.usuario.nome}</span>
      <span className="historico-dest">{item.destino}</span>
      <span className="historico-status" style={{ color: COR_SITUACAO[item.situacao] }}>
        {ROTULO_SITUACAO[item.situacao]}
      </span>
    </div>
  );
}
