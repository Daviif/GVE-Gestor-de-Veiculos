/** Formato único de erro devolvido pela API. */
export interface RespostaErro {
  erro: {
    codigo: string;
    mensagem: string;
  };
}
