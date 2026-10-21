import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useSessao } from '../auth/contexto';
import { Avatar } from './Avatar';
import { Logo } from './Logo';
import { itensAdmin, itensMenu, tituloDaPagina } from './navegacao';

/**
 * Moldura das telas internas. No desktop: cabeçalho com usuário e menu lateral.
 * No celular: cabeçalho com o título da tela e abas no rodapé.
 */
export function Layout() {
  const { usuario, sair } = useSessao();
  const { pathname } = useLocation();
  const navegar = useNavigate();
  if (!usuario) return null;

  const admin = usuario.perfil === 'ADMINISTRADOR';
  const naAreaAdmin = pathname.startsWith('/admin/');
  const voltarPara = naAreaAdmin ? '/conta' : pathname === '/reservas/nova' ? '/' : null;

  return (
    <div className="app">
      <header className="topo topo-desktop">
        <div className="topo-marca">
          <Logo className="topo-logo" />
          <span className="topo-divisor" />
          <div>
            <div className="topo-titulo">Gestão Veicular</div>
            <div className="topo-subtitulo">Secretaria de Educação</div>
          </div>
        </div>
        <div className="topo-usuario">
          <Avatar nome={usuario.nome} />
          <span className="topo-nome" title={usuario.nome}>
            {usuario.nome}
          </span>
          <button type="button" className="botao-borda botao-pequeno" onClick={() => void sair()}>
            Sair
          </button>
        </div>
      </header>

      <header className="topo topo-celular">
        {voltarPara && (
          <button
            type="button"
            className="topo-voltar"
            aria-label="Voltar"
            onClick={() => navegar(voltarPara)}
          >
            ←
          </button>
        )}
        {pathname === '/' && <Logo className="topo-logo-celular" />}
        <div className="topo-titulo-celular">{tituloDaPagina(pathname)}</div>
      </header>

      <div className="app-corpo">
        <nav className="menu-lateral" aria-label="Menu">
          {itensMenu.map((item) => (
            <NavLink key={item.caminho} to={item.caminho} end className="menu-item">
              {item.titulo}
            </NavLink>
          ))}
          {admin && (
            <>
              <div className="menu-divisor" />
              <div className="rotulo-secao">Administração</div>
              {itensAdmin.map((item) => (
                <NavLink key={item.caminho} to={item.caminho} className="menu-item">
                  {item.titulo}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <main className="conteudo">
          <Outlet />
        </main>
      </div>

      <nav className="abas" aria-label="Abas">
        {itensMenu.map((item) => (
          <NavLink
            key={item.caminho}
            to={item.caminho}
            end
            className={({ isActive }) =>
              isActive || (item.caminho === '/conta' && naAreaAdmin) ? 'aba ativa' : 'aba'
            }
          >
            <span className="aba-barra" />
            {item.aba}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
