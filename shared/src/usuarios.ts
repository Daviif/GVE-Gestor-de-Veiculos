import { z } from 'zod';

export const NOME_MAX = 120;
export const EMAIL_MAX = 254;

/** Perfis possíveis de um usuário (RN08). */
export const PERFIS = ['ADMINISTRADOR', 'SERVIDOR'] as const;

/** Só os 11 dígitos, sem máscara (igual ao que o banco guarda). */
export function normalizarCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

/** Confere os dois dígitos verificadores do CPF (RF03). */
export function validarCpf(cpf: string): boolean {
  const num = normalizarCpf(cpf);
  if (num.length !== 11 || /^(\d)\1{10}$/.test(num)) return false;

  const digitos = num.split('').map(Number);
  for (let tamanho = 9; tamanho < 11; tamanho++) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += digitos[i]! * (tamanho + 1 - i);
    let verificador = (soma * 10) % 11;
    if (verificador === 10) verificador = 0;
    if (verificador !== digitos[tamanho]) return false;
  }
  return true;
}

/** Formata para exibição: 52998224725 → 529.982.247-25. */
export function mascararCpf(cpf: string): string {
  const num = normalizarCpf(cpf);
  return num.length === 11 ? num.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : cpf;
}

/** Cadastro e edição de usuário (RF03, RN08). Validado igual no formulário e na API. */
export const usuarioSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, 'Informe o nome.')
    .max(NOME_MAX, `O nome pode ter no máximo ${NOME_MAX} caracteres.`),
  email: z
    .string()
    .trim()
    .min(1, 'Informe o e-mail.')
    .transform((valor) => valor.toLowerCase())
    .pipe(
      z
        .email('E-mail inválido.')
        .max(EMAIL_MAX, `O e-mail pode ter no máximo ${EMAIL_MAX} caracteres.`),
    ),
  cpf: z
    .string()
    .trim()
    .min(1, 'Informe o CPF.')
    .transform(normalizarCpf)
    .pipe(z.string().refine(validarCpf, 'CPF inválido. Confira os números digitados.')),
  perfil: z.enum(PERFIS, { error: 'Selecione o perfil.' }),
});

export type UsuarioEntrada = z.input<typeof usuarioSchema>;

/** Ativa ou desativa o acesso (RN10: desativado, nunca excluído). */
export const situacaoUsuarioSchema = z.object({
  ativo: z.boolean({ error: 'Informe se o usuário fica ativo.' }),
});

/** Usuário como a API devolve (sem a senha). */
export interface Usuario {
  id: number;
  nome: string;
  email: string;
  cpf: string;
  perfil: (typeof PERFIS)[number];
  ativo: boolean;
  trocaSenhaObrigatoria: boolean;
}
