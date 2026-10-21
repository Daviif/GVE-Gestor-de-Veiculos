import { useNavigate } from 'react-router';
import { useSessao } from '../auth/contexto';
import { FormSenha } from '../componentes/FormSenha';
import { useToast } from '../toast/contexto';

/** Troca obrigatória no primeiro acesso ou após redefinição pelo administrador. */
export function TrocaSenha() {
  const { sair } = useSessao();
  const navegar = useNavigate();
  const toast = useToast();

  return (
    <main className="tela-entrada">
      <div className="cartao-entrada">
        <div className="pilha-curta">
          <div className="sobretitulo">Primeiro acesso</div>
          <h1 className="titulo-cartao">Crie sua senha</h1>
          <p className="texto-suave">
            A senha recebida do administrador é temporária. Defina uma nova para continuar.
          </p>
        </div>
        <FormSenha
          primeiroAcesso
          textoBotao="Salvar e continuar"
          aoConcluir={() => {
            toast('Senha criada. Boas-vindas!');
            navegar('/', { replace: true });
          }}
        />
        <button type="button" className="botao-link" onClick={() => void sair()}>
          Sair
        </button>
      </div>
    </main>
  );
}
