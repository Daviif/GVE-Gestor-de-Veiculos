import { describe, expect, it } from 'vitest';
import { loginSchema } from './auth';

describe('loginSchema', () => {
  it('aceita e-mail ou CPF com senha', () => {
    expect(loginSchema.safeParse({ login: ' ana@exemplo.com ', senha: 'x' }).success).toBe(true);
  });

  it('recusa login vazio com mensagem em português', () => {
    const resultado = loginSchema.safeParse({ login: '  ', senha: 'x' });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe('Informe o e-mail ou o CPF.');
  });
});
