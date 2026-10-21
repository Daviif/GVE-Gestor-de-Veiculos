import { mascararCpf, PERFIS, usuarioSchema, type Usuario, type UsuarioEntrada } from '@gve/shared';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ErroApi } from '../../api';
import { useToast } from '../../toast/contexto';

const ROTULO_PERFIL: Record<(typeof PERFIS)[number], string> = {
  ADMINISTRADOR: 'Administrador',
  SERVIDOR: 'Servidor',
};

function mensagemDe(erro: unknown): string {
  return erro instanceof ErroApi ? erro.message : 'Erro inesperado. Tente novamente.';
}

interface PropsForm {
  inicial?: Usuario;
  textoBotao: string;
  aoSalvar(usuario: Usuario, senhaProvisoria?: string): void;
  aoCancelar?(): void;
}

/** Nome, e-mail, CPF e perfil, no cadastro e na edição. */
function FormUsuario({ inicial, textoBotao, aoSalvar, aoCancelar }: PropsForm) {
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [email, setEmail] = useState(inicial?.email ?? '');
  const [cpf, setCpf] = useState(inicial ? mascararCpf(inicial.cpf) : '');
  const [perfil, setPerfil] = useState<UsuarioEntrada['perfil']>(inicial?.perfil ?? 'SERVIDOR');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    const validacao = usuarioSchema.safeParse({ nome, email, cpf, perfil });
    if (!validacao.success) {
      setErro(validacao.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }

    setEnviando(true);
    try {
      const r = await api<{ usuario: Usuario; senhaProvisoria?: string }>(
        inicial ? `/usuarios/${inicial.id}` : '/usuarios',
        { metodo: inicial ? 'PUT' : 'POST', corpo: validacao.data },
      );
      if (!inicial) {
        setNome('');
        setEmail('');
        setCpf('');
        setPerfil('SERVIDOR');
      }
      aoSalvar(r.usuario, r.senhaProvisoria);
    } catch (e) {
      setErro(mensagemDe(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="pilha" onSubmit={enviar} noValidate>
      <div className="form-grade">
        <label className="rotulo">
          Nome
          <input
            className="campo"
            type="text"
            autoComplete="off"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </label>
        <label className="rotulo">
          E-mail
          <input
            className="campo"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="rotulo">
          CPF
          <input
            className="campo"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
          />
        </label>
        <label className="rotulo">
          Perfil
          <select
            className="campo"
            value={perfil}
            onChange={(e) => setPerfil(e.target.value as UsuarioEntrada['perfil'])}
          >
            {PERFIS.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PERFIL[p]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      <div className="acoes">
        <button type="submit" className="botao" disabled={enviando}>
          {enviando ? 'Salvando…' : textoBotao}
        </button>
        {aoCancelar && (
          <button type="button" className="botao-link" onClick={aoCancelar}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

/** Usuários da secretaria (RF03, RF04): cadastro, edição, desativação e redefinição de senha. */
export function Usuarios() {
  const toast = useToast();
  const [usuarios, setUsuarios] = useState<Usuario[] | undefined>(undefined);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [busca, setBusca] = useState('');
  const [provisoria, setProvisoria] = useState<{ nome: string; senha: string } | null>(null);

  useEffect(() => {
    api<{ usuarios: Usuario[] }>('/usuarios')
      .then((r) => setUsuarios(r.usuarios))
      .catch((e) => setErroCarga(mensagemDe(e)));
  }, []);

  function substituir(usuario: Usuario) {
    setUsuarios((lista) => lista?.map((u) => (u.id === usuario.id ? usuario : u)));
  }

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!usuarios || !termo) return usuarios;
    const soDigitos = termo.replace(/\D/g, '');
    return usuarios.filter(
      (u) =>
        u.nome.toLowerCase().includes(termo) ||
        u.email.toLowerCase().includes(termo) ||
        (soDigitos !== '' && u.cpf.includes(soDigitos)),
    );
  }, [usuarios, busca]);

  async function mudarSituacao(usuario: Usuario) {
    const ativo = !usuario.ativo;
    if (
      !ativo &&
      !window.confirm(`Desativar o acesso de ${usuario.nome}? As sessões abertas serão encerradas.`)
    ) {
      return;
    }
    try {
      const r = await api<{ usuario: Usuario }>(`/usuarios/${usuario.id}/situacao`, {
        metodo: 'PATCH',
        corpo: { ativo },
      });
      substituir(r.usuario);
      toast(ativo ? 'Usuário reativado.' : 'Usuário desativado.');
    } catch (e) {
      toast(mensagemDe(e));
    }
  }

  async function redefinirSenha(usuario: Usuario) {
    if (!window.confirm(`Gerar uma nova senha provisória para ${usuario.nome}?`)) return;
    try {
      const r = await api<{ senhaProvisoria: string }>(`/usuarios/${usuario.id}/redefinir-senha`, {
        metodo: 'POST',
      });
      substituir({ ...usuario, trocaSenhaObrigatoria: true });
      setProvisoria({ nome: usuario.nome, senha: r.senhaProvisoria });
    } catch (e) {
      toast(mensagemDe(e));
    }
  }

  return (
    <div className="pagina pagina-media">
      <h1 className="titulo-pagina">Usuários</h1>

      {provisoria && (
        <div className="destaque-senha" role="status">
          <div>
            Senha provisória de <strong>{provisoria.nome}</strong>. Anote e repasse — ela não será
            mostrada de novo. No primeiro acesso, o sistema pede para trocá-la.
          </div>
          <code className="senha-codigo">{provisoria.senha}</code>
          <button type="button" className="botao-link" onClick={() => setProvisoria(null)}>
            Fechar
          </button>
        </div>
      )}

      <section className="cartao pilha" aria-labelledby="titulo-novo-usuario">
        <h2 id="titulo-novo-usuario" className="titulo-cartao-pequeno">
          Novo usuário
        </h2>
        <FormUsuario
          textoBotao="Cadastrar"
          aoSalvar={(usuario, senha) => {
            setUsuarios((lista) => [usuario, ...(lista ?? [])]);
            if (senha) setProvisoria({ nome: usuario.nome, senha });
            toast('Usuário cadastrado.');
          }}
        />
      </section>

      <section className="pilha-curta">
        <div className="pagina-topo">
          <h2 className="rotulo-lista">Cadastrados</h2>
          <input
            className="campo campo-busca"
            type="search"
            placeholder="Buscar por nome, e-mail ou CPF"
            aria-label="Buscar usuário"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        {erroCarga ? (
          <p className="erro" role="alert">
            {erroCarga}
          </p>
        ) : usuarios === undefined ? (
          <div className="vazio" role="status">
            Carregando…
          </div>
        ) : usuarios.length === 0 ? (
          <div className="vazio">Nenhum usuário cadastrado.</div>
        ) : filtrados && filtrados.length === 0 ? (
          <div className="vazio">Nenhum usuário encontrado para “{busca}”.</div>
        ) : (
          <ul className="lista-itens">
            {filtrados?.map((usuario) =>
              editando === usuario.id ? (
                <li key={usuario.id} className="cartao" aria-label={`Editar ${usuario.nome}`}>
                  <FormUsuario
                    inicial={usuario}
                    textoBotao="Salvar"
                    aoSalvar={(editado) => {
                      substituir(editado);
                      setEditando(null);
                      toast('Usuário atualizado.');
                    }}
                    aoCancelar={() => setEditando(null)}
                  />
                </li>
              ) : (
                <li
                  key={usuario.id}
                  className={usuario.ativo ? 'cartao item-lista' : 'cartao item-lista inativo'}
                  aria-label={usuario.nome}
                >
                  <div className="item-dados">
                    <div className="item-titulo">
                      {usuario.nome}
                      <span className="etiqueta-perfil">{ROTULO_PERFIL[usuario.perfil]}</span>
                      {!usuario.ativo && <span className="etiqueta">Desativado</span>}
                    </div>
                    <div className="item-subtitulo">
                      {usuario.email} · {mascararCpf(usuario.cpf)}
                    </div>
                  </div>
                  <div className="acoes">
                    <button
                      type="button"
                      className="botao-borda botao-pequeno"
                      onClick={() => setEditando(usuario.id)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="botao-borda botao-pequeno"
                      onClick={() => void redefinirSenha(usuario)}
                    >
                      Redefinir senha
                    </button>
                    <button
                      type="button"
                      className="botao-borda botao-pequeno"
                      onClick={() => void mudarSituacao(usuario)}
                    >
                      {usuario.ativo ? 'Desativar' : 'Reativar'}
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
