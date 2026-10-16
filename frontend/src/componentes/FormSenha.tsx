import { trocaSenhaSchema, type UsuarioSessao } from '@gve/shared';
import { useState, type FormEvent } from 'react';
import { api, ErroApi } from '../api';
import { useSessao } from '../auth/contexto';

interface Props {
  /** Primeiro acesso: sem senha atual e com rótulos visíveis. */
  primeiroAcesso?: boolean;
  textoBotao: string;
  aoConcluir(usuario: UsuarioSessao): void;
}

/** Troca da própria senha (RF14), no primeiro acesso e em Minha conta. */
export function FormSenha({ primeiroAcesso = false, textoBotao, aoConcluir }: Props) {
  const { atualizarUsuario } = useSessao();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    const validacao = trocaSenhaSchema.safeParse(
      primeiroAcesso ? { novaSenha } : { senhaAtual, novaSenha },
    );
    if (!validacao.success) {
      setErro(validacao.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    if (novaSenha !== confirmacao) {
      setErro('As senhas não conferem.');
      return;
    }

    setEnviando(true);
    try {
      const r = await api<{ usuario: UsuarioSessao }>('/auth/senha', {
        metodo: 'PUT',
        corpo: validacao.data,
      });
      atualizarUsuario(r.usuario);
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmacao('');
      aoConcluir(r.usuario);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Erro inesperado. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  const campo = (
    rotulo: string,
    valor: string,
    mudar: (v: string) => void,
    autoComplete: string,
    placeholder?: string,
  ) => {
    const input = (
      <input
        className="campo"
        type="password"
        autoComplete={autoComplete}
        value={valor}
        onChange={(e) => mudar(e.target.value)}
        placeholder={placeholder}
        aria-label={primeiroAcesso ? undefined : rotulo}
      />
    );
    return primeiroAcesso ? (
      <label className="rotulo">
        {rotulo}
        {input}
      </label>
    ) : (
      input
    );
  };

  return (
    <form className="pilha" onSubmit={enviar} noValidate>
      {!primeiroAcesso &&
        campo('Senha atual', senhaAtual, setSenhaAtual, 'current-password', 'Senha atual')}
      {campo(
        'Nova senha',
        novaSenha,
        setNovaSenha,
        'new-password',
        primeiroAcesso ? 'Mínimo de 8 caracteres' : 'Nova senha (mín. 8 caracteres)',
      )}
      {campo(
        'Confirmar nova senha',
        confirmacao,
        setConfirmacao,
        'new-password',
        primeiroAcesso ? undefined : 'Confirmar nova senha',
      )}
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      <button type="submit" className="botao" disabled={enviando}>
        {enviando ? 'Salvando…' : textoBotao}
      </button>
    </form>
  );
}
