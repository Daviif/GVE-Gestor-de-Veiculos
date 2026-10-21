import type { RespostaErro } from '@gve/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

/** Erro esperado da aplicação, já com status HTTP e mensagem para o usuário. */
export class ErroApi extends Error {
  readonly status: number;
  readonly codigo: string;
  /** Campo do formulário a que o erro se refere, para a tela mostrar ao lado dele. */
  readonly campo?: string;

  constructor(status: number, codigo: string, mensagem: string, campo?: string) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.campo = campo;
  }
}

export const rotaNaoEncontrada: RequestHandler = (_req, _res, next) => {
  next(new ErroApi(404, 'NAO_ENCONTRADO', 'Rota não encontrada.'));
};

/**
 * Erros do express.json: o cliente mandou um corpo que nem dá para ler. São culpa da
 * requisição (4xx), não do servidor, então não vão para o log como erro inesperado.
 */
const ERROS_DO_CORPO: Record<string, { status: number; codigo: string; mensagem: string }> = {
  'entity.parse.failed': {
    status: 400,
    codigo: 'JSON_INVALIDO',
    mensagem: 'O corpo da requisição não é um JSON válido.',
  },
  'entity.too.large': {
    status: 413,
    codigo: 'CORPO_GRANDE_DEMAIS',
    mensagem: 'O corpo da requisição é grande demais.',
  },
  'charset.unsupported': {
    status: 415,
    codigo: 'FORMATO_NAO_SUPORTADO',
    mensagem: 'Envie o corpo em JSON codificado em UTF-8.',
  },
  'encoding.unsupported': {
    status: 415,
    codigo: 'FORMATO_NAO_SUPORTADO',
    mensagem: 'A compressão usada no corpo da requisição não é suportada.',
  },
  'request.aborted': {
    status: 400,
    codigo: 'REQUISICAO_INCOMPLETA',
    mensagem: 'A requisição foi interrompida antes de terminar.',
  },
  'request.size.invalid': {
    status: 400,
    codigo: 'REQUISICAO_INCOMPLETA',
    mensagem: 'O corpo da requisição chegou incompleto.',
  },
};

export const tratarErros: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let corpo: RespostaErro = {
    erro: { codigo: 'ERRO_INTERNO', mensagem: 'Erro inesperado. Tente novamente.' },
  };

  if (err instanceof ErroApi) {
    status = err.status;
    corpo = { erro: { codigo: err.codigo, mensagem: err.message } };
    if (err.campo) corpo.erro.campo = err.campo;
  } else if (err instanceof ZodError) {
    status = 400;
    const issue = err.issues[0];
    corpo = {
      erro: { codigo: 'ENTRADA_INVALIDA', mensagem: issue?.message ?? 'Dados inválidos.' },
    };
    if (typeof issue?.path[0] === 'string') corpo.erro.campo = issue.path[0];
  } else if (typeof err?.type === 'string' && Object.hasOwn(ERROS_DO_CORPO, err.type)) {
    const { status: s, codigo, mensagem } = ERROS_DO_CORPO[err.type]!;
    status = s;
    corpo = { erro: { codigo, mensagem } };
  } else if (err?.expose === true && err.status >= 400 && err.status < 500) {
    // Outros erros de leitura do corpo que já vêm marcados como culpa do cliente
    // (ex.: corpo comprimido corrompido): 400, sem expor a mensagem técnica em inglês.
    status = 400;
    corpo = {
      erro: {
        codigo: 'REQUISICAO_INVALIDA',
        mensagem: 'Não foi possível ler o corpo da requisição.',
      },
    };
  } else {
    console.error(err);
  }

  res.status(status).json(corpo);
};
