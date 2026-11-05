import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useSessao } from '../auth/contexto';
import { Avatar } from './Avatar';
import { Logo } from './Logo';
import { itensAdmin, itensMenu, tituloDaPagina } from './navegacao';
import { useTitulo } from './titulo';

/**
 * Moldura das telas internas. No desktop: cabeçalho com usuário e menu lateral.
 * No celular: cabeçalho com o título da tela e abas no rodapé.
 */
export function Layout() {
  const { usuario, sair } = useSessao();
  const { pathname } = useLocation();
  const navegar = useNavigate();
  const conteudo = useRef<HTMLElement>(null);
  const caminhoAnterior = useRef(pathname);

  useTitulo(tituloDaPagina(pathname));

  // Ao trocar de tela, o foco vai para o conteúdo: quem usa teclado ou leitor de tela não fica
  // preso no link do menu que acabou de usar.
  useEffect(() => {
    if (caminhoAnterior.current !== pathname) {
      caminhoAnterior.current = pathname;
      conteudo.current?.focus();
    }
  }, [pathname]);

  if (!usuario) return null;

  const admin = usuario.perfil === 'ADMINISTRADOR';
  const naAreaAdmin = pathname.startsWith('/admin/');
  const voltarPara = naAreaAdmin ? '/conta' : pathname === '/reservas/nova' ? '/' : null;

  return (
    <div className="app">
      <a className="pular-conteudo" href="#conteudo">
        Pular para o conteúdo
      </a>
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

        <main id="conteudo" className="conteudo" ref={conteudo} tabIndex={-1}>
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
