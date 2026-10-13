import type { RespostaErro } from '@gve/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

/** Erro esperado da aplicação, já com status HTTP e mensagem para o usuário. */
export class ErroApi extends Error {
  readonly status: number;
  readonly codigo: string;

  constructor(status: number, codigo: string, mensagem: string) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
  }
}

export const rotaNaoEncontrada: RequestHandler = (_req, _res, next) => {
  next(new ErroApi(404, 'NAO_ENCONTRADO', 'Rota não encontrada.'));
};

export const tratarErros: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let corpo: RespostaErro = {
    erro: { codigo: 'ERRO_INTERNO', mensagem: 'Erro inesperado. Tente novamente.' },
  };

  if (err instanceof ErroApi) {
    status = err.status;
    corpo = { erro: { codigo: err.codigo, mensagem: err.message } };
  } else if (err instanceof ZodError) {
    status = 400;
    corpo = {
      erro: { codigo: 'ENTRADA_INVALIDA', mensagem: err.issues[0]?.message ?? 'Dados inválidos.' },
    };
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    corpo = {
      erro: { codigo: 'JSON_INVALIDO', mensagem: 'O corpo da requisição não é um JSON válido.' },
    };
  } else {
    console.error(err);
  }

  res.status(status).json(corpo);
};
