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

/** Formulário de cadastro/edição (nome, e-mail, CPF e perfil). */
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
    <form className="form-usuario" onSubmit={enviar} noValidate>
      <input
        className="campo"
        type="text"
        placeholder="Nome completo"
        aria-label="Nome"
        autoComplete="off"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
      />
      <input
        className="campo"
        type="email"
        placeholder="E-mail"
        aria-label="E-mail"
        autoComplete="off"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="campo"
        type="text"
        inputMode="numeric"
        placeholder="CPF (000.000.000-00)"
        aria-label="CPF"
        autoComplete="off"
        value={cpf}
        onChange={(e) => setCpf(e.target.value)}
      />
      <select
        className="campo"
        aria-label="Perfil"
        value={perfil}
        onChange={(e) => setPerfil(e.target.value as UsuarioEntrada['perfil'])}
      >
        {PERFIS.map((p) => (
          <option key={p} value={p}>
            {ROTULO_PERFIL[p]}
          </option>
        ))}
      </select>
      <button type="submit" className="botao-salvar" disabled={enviando}>
        {enviando ? 'Salvando…' : textoBotao}
      </button>
      {aoCancelar && (
        <button type="button" className="botao-link" onClick={aoCancelar}>
          Cancelar
        </button>
      )}
      {erro && (
        <p className="erro erro-form" role="alert">
          {erro}
        </p>
      )}
    </form>
  );
}

/** Usuários da secretaria (RF03, RF04): cadastro, edição, desativação e redefinição de senha. */
export function Usuarios() {
  const toast = useToast();
  const [usuarios, setUsuarios] = useState<Usuario[] | undefined>(undefined);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
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
      <div className="pagina-topo">
        <h1 className="titulo-pagina">Usuários</h1>
        <button
          type="button"
          className="botao botao-cadastrar"
          onClick={() => setCadastrando((v) => !v)}
        >
          {cadastrando ? 'Fechar' : '+ Cadastrar usuário'}
        </button>
      </div>

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

      {cadastrando && (
        <div className="cartao-form">
          <FormUsuario
            textoBotao="Salvar"
            aoSalvar={(usuario, senha) => {
              setUsuarios((lista) => [usuario, ...(lista ?? [])]);
              if (senha) setProvisoria({ nome: usuario.nome, senha });
              setCadastrando(false);
              toast('Usuário cadastrado.');
            }}
            aoCancelar={() => setCadastrando(false)}
          />
        </div>
      )}

      <input
        className="campo campo-busca"
        type="search"
        placeholder="Buscar por nome, e-mail ou CPF"
        aria-label="Buscar usuário"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

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
        <div className="lista-usuarios">
          {filtrados?.map((usuario) =>
            editando === usuario.id ? (
              <div key={usuario.id} className="cartao-form" aria-label={`Editar ${usuario.nome}`}>
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
              </div>
            ) : (
              <div
                key={usuario.id}
                className={usuario.ativo ? 'linha-usuario' : 'linha-usuario inativo'}
                aria-label={usuario.nome}
              >
                <div className="usuario-nome-bloco">
                  <div className="usuario-nome">{usuario.nome}</div>
                  <div className="usuario-email">
                    {usuario.email} · {mascararCpf(usuario.cpf)}
                  </div>
                </div>
                <span className="usuario-perfil">{ROTULO_PERFIL[usuario.perfil]}</span>
                <span className={usuario.ativo ? 'status-pill ativo' : 'status-pill inativo'}>
                  {usuario.ativo ? 'Ativo' : 'Inativo'}
                </span>
                <div className="usuario-acoes">
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
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
