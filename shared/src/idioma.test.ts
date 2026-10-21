import { describe, expect, it } from 'vitest';
import { loginSchema } from './index';

describe('mensagens do Zod', () => {
  it('as genéricas saem em português', () => {
    expect(loginSchema.safeParse(undefined).error?.issues[0]?.message).toMatch(/^Entrada inválida/);
    expect(loginSchema.safeParse({ login: 1, senha: 'x' }).error?.issues[0]?.message).toMatch(
      /^Entrada inválida/,
    );
  });

  it('as escritas nos schemas continuam valendo', () => {
    expect(loginSchema.safeParse({ login: '', senha: 'x' }).error?.issues[0]?.message).toBe(
      'Informe o e-mail ou o CPF.',
    );
  });
});
