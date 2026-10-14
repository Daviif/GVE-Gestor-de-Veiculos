import { hash, verify } from '@node-rs/argon2';

// O padrão da biblioteca já é Argon2id (RNF06), com 19 MiB e 2 passadas.

export function gerarHashSenha(senha: string): Promise<string> {
  return hash(senha);
}

export function conferirSenha(senhaHash: string, senha: string): Promise<boolean> {
  return verify(senhaHash, senha);
}
