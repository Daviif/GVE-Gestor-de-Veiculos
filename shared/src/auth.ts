import { z } from 'zod';

/** Login por e-mail ou CPF (RF01). Validado igual no formulário e na API. */
export const loginSchema = z.object({
  login: z.string().trim().min(1, 'Informe o e-mail ou o CPF.'),
  senha: z.string().min(1, 'Informe a senha.'),
});

export type LoginEntrada = z.infer<typeof loginSchema>;

export const SENHA_MIN = 8;
export const SENHA_MAX = 128;

/**
 * Troca da própria senha (RF14). A senha atual é dispensada só na troca obrigatória do
 * primeiro acesso, logo depois de entrar com a senha temporária.
 */
export const trocaSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a senha atual.').optional(),
    novaSenha: z
      .string()
      .min(SENHA_MIN, `A senha precisa ter ao menos ${SENHA_MIN} caracteres.`)
      .max(SENHA_MAX, `A senha pode ter no máximo ${SENHA_MAX} caracteres.`),
  })
  .refine((dados) => dados.novaSenha !== dados.senhaAtual, {
    message: 'A nova senha deve ser diferente da atual.',
    path: ['novaSenha'],
  });

export type TrocaSenhaEntrada = z.infer<typeof trocaSenhaSchema>;

export type Perfil = 'ADMINISTRADOR' | 'SERVIDOR';

/** Usuário da sessão, devolvido por /auth/login e /auth/me. */
export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  trocaSenhaObrigatoria: boolean;
}

/**
 * Identifica se o login é e-mail ou CPF. O CPF aceita máscara (529.982.247-25);
 * o e-mail não diferencia maiúsculas.
 */
export function normalizarLogin(login: string): { tipo: 'email' | 'cpf'; valor: string } {
  const texto = login.trim();
  if (texto.includes('@')) return { tipo: 'email', valor: texto.toLowerCase() };
  return { tipo: 'cpf', valor: texto.replace(/\D/g, '') };
}
