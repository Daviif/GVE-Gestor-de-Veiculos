import { loginSchema } from '@gve/shared';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ErroApi } from '../api';
import { useSessao } from '../auth/contexto';
import { Logo } from '../componentes/Logo';

export function Login() {
  const { usuario, aviso, entrar } = useSessao();
  const navegar = useNavigate();
  const local = useLocation();
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const destino = (local.state as { de?: string } | null)?.de ?? '/';

  if (usuario && !enviando) return <Navigate to={destino} replace />;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    const validacao = loginSchema.safeParse({ login, senha });
    if (!validacao.success) {
      setErro(validacao.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }

    setEnviando(true);
    try {
      const u = await entrar(validacao.data);
      navegar(u.trocaSenhaObrigatoria ? '/trocar-senha' : destino, { replace: true });
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Erro inesperado. Tente novamente.');
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

        <label className="rotulo">
          E-mail ou CPF
          <input
            className="campo"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
        </label>
        <label className="rotulo">
          Senha
          <input
            className="campo"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </label>
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
