import { z } from 'zod';

/** Login por e-mail ou CPF (RF01). Validado igual no formulário e na API. */
export const loginSchema = z.object({
  login: z.string().trim().min(1, 'Informe o e-mail ou o CPF.'),
  senha: z.string().min(1, 'Informe a senha.'),
});

export type LoginEntrada = z.infer<typeof loginSchema>;
