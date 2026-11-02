import type { RespostaErro } from '@gve/shared';

/** Erro devolvido pela API, já com a mensagem para mostrar ao usuário. */
export class ErroApi extends Error {
  readonly status: number;
  readonly codigo: string;
  /** Campo do formulário a que o erro se refere, quando a API informa. */
  readonly campo?: string;

  constructor(status: number, codigo: string, mensagem: string, campo?: string) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.campo = campo;
  }
}

/** Disparado quando a API responde 401: a sessão venceu (RNF11) ou foi encerrada. */
export const EVENTO_SESSAO_EXPIRADA = 'gve:sessao-expirada';

export async function api<T>(caminho: string, opcoes: { metodo?: string; corpo?: unknown } = {}) {
  let resposta: Response;
  try {
    resposta = await fetch(`/api/v1${caminho}`, {
      method: opcoes.metodo ?? 'GET',
      headers: opcoes.corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
      credentials: 'same-origin',
    });
  } catch {
    throw new ErroApi(0, 'SEM_CONEXAO', 'Sem conexão com o servidor. Tente novamente.');
  }

  if (resposta.status === 204) return undefined as T;
  const corpo = await resposta.json().catch(() => null);
  if (resposta.ok) return corpo as T;

  const erro = (corpo as RespostaErro | null)?.erro;
  if (resposta.status === 401 && erro?.codigo === 'NAO_AUTENTICADO') {
    window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA));
  }
  throw new ErroApi(
    resposta.status,
    erro?.codigo ?? 'ERRO_INTERNO',
    erro?.mensagem ?? 'Erro inesperado. Tente novamente.',
    erro?.campo,
  );
}
