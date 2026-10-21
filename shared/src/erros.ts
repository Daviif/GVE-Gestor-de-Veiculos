import type { z } from 'zod';

/**
 * Formato único de erro devolvido pela API. `campo` aparece quando o erro é de um campo do
 * formulário (ex.: CPF já cadastrado), para a tela mostrar a mensagem ao lado dele.
 */
export interface RespostaErro {
  erro: {
    codigo: string;
    mensagem: string;
    campo?: string;
  };
}

/** Mensagem de erro por campo do formulário. */
export type ErrosDeCampo = Partial<Record<string, string>>;

/** A primeira mensagem de cada campo que falhou na validação. */
export function errosPorCampo(erro: z.ZodError): ErrosDeCampo {
  const erros: ErrosDeCampo = {};
  for (const issue of erro.issues) {
    const campo = issue.path[0];
    if (typeof campo === 'string') erros[campo] ??= issue.message;
  }
  return erros;
}
