import { trocaSenhaSchema, type UsuarioSessao } from '@gve/shared';
import { useState, type FormEvent } from 'react';
import { api, ErroApi } from '../api';
import { useSessao } from '../auth/contexto';
import { useErrosDeCampo } from './errosDeCampo';

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
  const campos = useErrosDeCampo();

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    setErro(null);
    campos.limpar();

    const validacao = trocaSenhaSchema.safeParse(
      primeiroAcesso ? { novaSenha } : { senhaAtual, novaSenha },
    );
    if (!validacao.success) {
      campos.deValidacao(form, validacao.error);
      return;
    }
    if (novaSenha !== confirmacao) {
      campos.mostrar(form, { confirmacao: 'As senhas não conferem.' });
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
      if (!campos.deApi(form, e)) {
        setErro(e instanceof ErroApi ? e.message : 'Erro inesperado. Tente novamente.');
      }
    } finally {
      setEnviando(false);
    }
  }

  const campo = (
    nome: string,
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
        {...campos.props(nome)}
      />
    );
    return (
      <div className="campo-grupo">
        {primeiroAcesso ? (
          <label className="rotulo">
            {rotulo}
            {input}
          </label>
        ) : (
          input
        )}
        {campos.mensagem(nome)}
      </div>
    );
  };

  return (
    <form className="pilha" onSubmit={enviar} noValidate>
      {!primeiroAcesso &&
        campo(
          'senhaAtual',
          'Senha atual',
          senhaAtual,
          setSenhaAtual,
          'current-password',
          'Senha atual',
        )}
      {campo(
        'novaSenha',
        'Nova senha',
        novaSenha,
        setNovaSenha,
        'new-password',
        primeiroAcesso ? 'Mínimo de 8 caracteres' : 'Nova senha (mín. 8 caracteres)',
      )}
      {campo(
        'confirmacao',
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
