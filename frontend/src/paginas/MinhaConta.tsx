import { Link } from 'react-router';
import { useSessao } from '../auth/contexto';
import { Avatar } from '../componentes/Avatar';
import { FormSenha } from '../componentes/FormSenha';
import { itensAdmin } from '../componentes/navegacao';
import { useToast } from '../toast/contexto';

const nomePerfil = { ADMINISTRADOR: 'Administrador', SERVIDOR: 'Servidor' } as const;

export function MinhaConta() {
  const { usuario, sair } = useSessao();
  const toast = useToast();
  if (!usuario) return null;

  return (
    <div className="pagina pagina-estreita">
      <h1 className="titulo-pagina">Minha conta</h1>

      <div className="cartao cartao-perfil">
        <Avatar nome={usuario.nome} grande />
        <div className="perfil-dados">
          <div className="perfil-nome">{usuario.nome}</div>
          <div className="perfil-email">{usuario.email}</div>
          <div className="perfil-tipo">{nomePerfil[usuario.perfil]}</div>
        </div>
      </div>

      <section className="cartao pilha">
        <h2 className="titulo-cartao-pequeno">Trocar senha</h2>
        <FormSenha textoBotao="Salvar nova senha" aoConcluir={() => toast('Senha alterada.')} />
      </section>

      {usuario.perfil === 'ADMINISTRADOR' && (
        <nav className="cartao lista-admin so-celular" aria-label="Administração">
          <div className="rotulo-secao">Administração</div>
          {itensAdmin.map((item) => (
            <Link key={item.caminho} to={item.caminho} className="lista-admin-item">
              {item.titulo}
              <span aria-hidden="true">›</span>
            </Link>
          ))}
        </nav>
      )}

      <button type="button" className="botao-perigo so-celular" onClick={() => void sair()}>
        Sair
      </button>
    </div>
  );
}
