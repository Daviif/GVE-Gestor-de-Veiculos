import { loginSchema } from '@gve/shared';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ErroApi } from '../api';
import { useSessao } from '../auth/contexto';
import { useErrosDeCampo } from '../componentes/errosDeCampo';
import { Logo } from '../componentes/Logo';

export function Login() {
  const { usuario, aviso, entrar } = useSessao();
  const navegar = useNavigate();
  const local = useLocation();
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campos = useErrosDeCampo();

  const destino = (local.state as { de?: string } | null)?.de ?? '/';

  if (usuario && !enviando) return <Navigate to={destino} replace />;

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = evento.currentTarget;
    setErro(null);
    campos.limpar();

    const validacao = loginSchema.safeParse({ login, senha });
    if (!validacao.success) {
      campos.deValidacao(form, validacao.error);
      return;
    }

    setEnviando(true);
    try {
      const u = await entrar(validacao.data);
      navegar(u.trocaSenhaObrigatoria ? '/trocar-senha' : destino, { replace: true });
    } catch (e) {
      // Senha errada fica embaixo do formulário, sem apontar campo: não revela qual dos dois errou.
      if (!campos.deApi(form, e)) {
        setErro(e instanceof ErroApi ? e.message : 'Erro inesperado. Tente novamente.');
      }
      setEnviando(false);
    }
  }

  return (
    <main className="tela-entrada tela-entrada-gradiente">
      <form className="cartao-entrada cartao-login" onSubmit={enviar} noValidate>
        <div className="login-marca">
          <Logo className="login-logo" />
          <div className="login-titulos">
            <h1 className="login-titulo">Gestão Veicular</h1>
            <div className="texto-suave">Secretaria Municipal de Educação</div>
          </div>
        </div>

        {aviso && !erro && (
          <p className="aviso" role="status">
            {aviso}
          </p>
        )}

        <div className="campo-grupo">
          <label className="rotulo">
            E-mail ou CPF
            <input
              className="campo"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              {...campos.props('login')}
            />
          </label>
          {campos.mensagem('login')}
        </div>
        <div className="campo-grupo">
          <label className="rotulo">
            Senha
            <input
              className="campo"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              {...campos.props('senha')}
            />
          </label>
          {campos.mensagem('senha')}
        </div>
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <button type="submit" className="botao botao-grande" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="login-ajuda">
          Esqueceu a senha?
          <br />
          Procure o administrador do sistema.
        </p>
      </form>
    </main>
  );
}
