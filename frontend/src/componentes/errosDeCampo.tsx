import { errosPorCampo, type ErrosDeCampo } from '@gve/shared';
import { useId, useState } from 'react';
import type { z } from 'zod';
import { ErroApi } from '../api';

/**
 * Erros mostrados ao lado de cada campo do formulário. O input recebe `name`, fica marcado
 * como inválido e aponta para a mensagem (leitores de tela leem as duas coisas juntas).
 */
export function useErrosDeCampo() {
  const prefixo = useId();
  const [erros, setErros] = useState<ErrosDeCampo>({});
  const idMensagem = (nome: string) => `${prefixo}-${nome}-erro`;

  /** O campo `nome` dentro do formulário (ou do trecho da tela que faz as vezes dele). */
  const acharCampo = (form: HTMLElement | null, nome: string) =>
    form?.querySelector<HTMLElement>(`[name="${nome}"]`) ?? null;

  /** Mostra os erros e põe o foco no primeiro campo com problema. */
  function mostrar(form: HTMLElement | null, novos: ErrosDeCampo) {
    setErros(novos);
    const primeiro = Object.keys(novos)[0];
    if (primeiro) acharCampo(form, primeiro)?.focus();
  }

  return {
    erros,
    mostrar,

    limpar: () => setErros({}),

    /** Erros da validação com o schema compartilhado. */
    deValidacao: (form: HTMLElement | null, erro: z.ZodError) => mostrar(form, errosPorCampo(erro)),

    /** Erro da API que aponta um campo deste formulário: mostra ao lado dele e devolve true. */
    deApi(form: HTMLElement | null, erro: unknown): boolean {
      if (!(erro instanceof ErroApi) || !erro.campo || !acharCampo(form, erro.campo)) return false;
      mostrar(form, { [erro.campo]: erro.message });
      return true;
    },

    /** Props do input do campo `nome`. */
    props: (nome: string) => ({
      name: nome,
      'aria-invalid': erros[nome] ? true : undefined,
      'aria-describedby': erros[nome] ? idMensagem(nome) : undefined,
    }),

    /** A mensagem do campo `nome`, para pôr logo abaixo dele. */
    mensagem: (nome: string) =>
      erros[nome] ? (
        <span id={idMensagem(nome)} className="erro-campo">
          {erros[nome]}
        </span>
      ) : null,
  };
}
