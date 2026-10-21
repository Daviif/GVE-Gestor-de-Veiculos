import { describe, expect, it } from 'vitest';
import { loginSchema, normalizarLogin, trocaSenhaSchema } from './auth';

describe('loginSchema', () => {
  it('aceita e-mail ou CPF com senha', () => {
    expect(loginSchema.safeParse({ login: ' ana@exemplo.com ', senha: 'x' }).success).toBe(true);
  });

  it('recusa login vazio com mensagem em português', () => {
    const resultado = loginSchema.safeParse({ login: '  ', senha: 'x' });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe('Informe o e-mail ou o CPF.');
  });

  it('recusa login ou senha maiores que os do cadastro', () => {
    const login = loginSchema.safeParse({ login: `${'a'.repeat(250)}@x.com`, senha: 'x' });
    expect(login.error?.issues[0]?.message).toBe('E-mail ou CPF longo demais.');
    const senha = loginSchema.safeParse({ login: 'ana@exemplo.com', senha: 'x'.repeat(129) });
    expect(senha.error?.issues[0]?.message).toBe('Senha longa demais.');
  });
});

describe('normalizarLogin', () => {
  it('trata e-mail sem diferenciar maiúsculas', () => {
    expect(normalizarLogin(' Ana@Exemplo.COM ')).toEqual({
      tipo: 'email',
      valor: 'ana@exemplo.com',
    });
  });

  it('tira a máscara do CPF', () => {
    expect(normalizarLogin('529.982.247-25')).toEqual({ tipo: 'cpf', valor: '52998224725' });
  });
});

describe('trocaSenhaSchema', () => {
  it('exige pelo menos 8 caracteres', () => {
    const resultado = trocaSenhaSchema.safeParse({ senhaAtual: 'admin123', novaSenha: 'curta' });
    expect(resultado.error?.issues[0]?.message).toBe('A senha precisa ter ao menos 8 caracteres.');
  });

  it('aceita a troca sem a senha atual (primeiro acesso)', () => {
    expect(trocaSenhaSchema.safeParse({ novaSenha: 'nova-senha-456' }).success).toBe(true);
  });

  it('recusa nova senha igual à atual', () => {
    const resultado = trocaSenhaSchema.safeParse({ senhaAtual: 'admin123', novaSenha: 'admin123' });
    expect(resultado.error?.issues[0]?.message).toBe('A nova senha deve ser diferente da atual.');
  });
});
