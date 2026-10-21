import { loginSchema, normalizarLogin, trocaSenhaSchema, type UsuarioSessao } from '@gve/shared';
import { Router } from 'express';
import { registrarAuditoria } from '../auditoria';
import { prisma } from '../db';
import type { Prisma, Usuario } from '../generated/prisma/client';
import { autenticar } from '../middleware/autenticacao';
import { ErroApi } from '../middleware/erros';
import { conferirSenha, gerarHashSenha } from '../seguranca/senha';
import {
  abrirSessao,
  apagarCookieSessao,
  encerrarSessao,
  gravarCookieSessao,
  lerTokenSessao,
} from '../seguranca/sessao';

/** Bloqueio após 5 tentativas erradas em 15 min, por conta (ou pelo login digitado, se não existe). */
export const MAX_TENTATIVAS = 5;
export const JANELA_TENTATIVAS_MS = 15 * 60 * 1000;

const CREDENCIAIS_INVALIDAS = 'E-mail/CPF ou senha incorretos.';

// Conferido quando o login não existe, para a resposta levar o mesmo tempo (não revela quem tem cadastro).
let hashFicticio: Promise<string> | undefined;

export const rotasAuth = Router();

function paraSessao(usuario: Usuario): UsuarioSessao {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil,
    trocaSenhaObrigatoria: usuario.trocaSenhaObrigatoria,
  };
}

/** Quando o login fica liberado de novo, ou null se não está bloqueado. */
async function bloqueadoAte(
  tx: Prisma.TransactionClient,
  usuario: Usuario | null,
  login: string,
  agora: number,
): Promise<Date | null> {
  let desde = new Date(agora - JANELA_TENTATIVAS_MS);

  let filtro: Prisma.LogAuditoriaWhereInput;
  if (usuario) {
    filtro = { usuarioId: usuario.id };
    // Um login certo zera a contagem.
    const ultimoLogin = await tx.logAuditoria.findFirst({
      where: { usuarioId: usuario.id, acao: 'LOGIN', criadoEm: { gte: desde } },
      orderBy: { criadoEm: 'desc' },
      select: { criadoEm: true },
    });
    if (ultimoLogin) desde = ultimoLogin.criadoEm;
  } else {
    filtro = { usuarioId: null, detalhes: { path: ['login'], equals: login } };
  }

  const falhas = await tx.logAuditoria.findMany({
    where: {
      ...filtro,
      acao: 'LOGIN_FALHA',
      criadoEm: { gt: desde },
      // Tentativas feitas durante o bloqueio não o prolongam.
      NOT: { detalhes: { path: ['motivo'], equals: 'BLOQUEADO' } },
    },
    orderBy: { criadoEm: 'desc' },
    take: MAX_TENTATIVAS,
    select: { criadoEm: true },
  });
  const quintaFalha = falhas[MAX_TENTATIVAS - 1];
  if (!quintaFalha) return null;
  return new Date(quintaFalha.criadoEm.getTime() + JANELA_TENTATIVAS_MS);
}

rotasAuth.post('/login', async (req, res) => {
  const entrada = loginSchema.parse(req.body);
  const login = normalizarLogin(entrada.login);
  const agora = Date.now();

  const usuario = login.valor
    ? await prisma.usuario.findUnique({
        where: login.tipo === 'email' ? { email: login.valor } : { cpf: login.valor },
      })
    : null;

  // Tentativas na mesma conta (ou no mesmo login inexistente) passam uma de cada vez:
  // conferir o bloqueio, testar a senha e gravar a falha é atômico. Sem isso, várias
  // tentativas em paralelo veriam a contagem antiga e passariam do limite.
  const chave = usuario ? `usuario:${usuario.id}` : `login:${login.valor}`;
  const erro = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chave}))`;

      const falha = async (motivo: string, erroApi: ErroApi) => {
        await tx.logAuditoria.create({
          data: {
            acao: 'LOGIN_FALHA',
            usuarioId: usuario?.id ?? null,
            detalhes: usuario ? { motivo } : { motivo, login: login.valor },
            ip: req.ip,
          },
        });
        return erroApi;
      };

      const liberaEm = await bloqueadoAte(tx, usuario, login.valor, agora);
      if (liberaEm) {
        const minutos = Math.max(1, Math.ceil((liberaEm.getTime() - agora) / 60_000));
        return falha(
          'BLOQUEADO',
          new ErroApi(
            429,
            'LOGIN_BLOQUEADO',
            `Muitas tentativas sem sucesso. Tente novamente em ${minutos} min.`,
          ),
        );
      }

      if (!usuario) {
        hashFicticio ??= gerarHashSenha('senha-ficticia');
        await conferirSenha(await hashFicticio, entrada.senha);
        return falha(
          'CREDENCIAIS',
          new ErroApi(401, 'CREDENCIAIS_INVALIDAS', CREDENCIAIS_INVALIDAS),
        );
      }

      if (!(await conferirSenha(usuario.senhaHash, entrada.senha))) {
        return falha(
          'CREDENCIAIS',
          new ErroApi(401, 'CREDENCIAIS_INVALIDAS', CREDENCIAIS_INVALIDAS),
        );
      }

      // Só revela que a conta está desativada para quem acertou a senha.
      if (!usuario.ativo) {
        return falha(
          'DESATIVADO',
          new ErroApi(
            403,
            'USUARIO_DESATIVADO',
            'Seu acesso está desativado. Procure o administrador.',
          ),
        );
      }

      // Gravado ainda com o lock: zera a contagem antes da próxima tentativa.
      await tx.logAuditoria.create({ data: { acao: 'LOGIN', usuarioId: usuario.id, ip: req.ip } });
      return null;
    },
    // Tentativas na fila esperam o lock dentro da transação; o padrão de 5 s é curto para isso.
    { maxWait: 10_000, timeout: 30_000 },
  );
  // O erro sai depois do commit, para a falha ficar gravada.
  if (erro) throw erro;

  const token = await abrirSessao(usuario!.id);
  gravarCookieSessao(res, token);
  res.json({ usuario: paraSessao(usuario!) });
});

/** Funciona mesmo com a sessão vencida: o objetivo é só apagar o cookie. */
rotasAuth.post('/logout', async (req, res) => {
  const token = lerTokenSessao(req);
  const usuarioId = token ? await encerrarSessao(token) : null;
  if (usuarioId) await registrarAuditoria({ acao: 'LOGOUT', usuarioId, ip: req.ip });
  apagarCookieSessao(res);
  res.status(204).end();
});

rotasAuth.get('/me', autenticar({ permitirTrocaPendente: true }), (req, res) => {
  res.json({ usuario: paraSessao(req.usuario!) });
});

rotasAuth.put('/senha', autenticar({ permitirTrocaPendente: true }), async (req, res) => {
  const entrada = trocaSenhaSchema.parse(req.body);
  const usuario = req.usuario!;

  if (entrada.senhaAtual !== undefined) {
    if (!(await conferirSenha(usuario.senhaHash, entrada.senhaAtual))) {
      throw new ErroApi(400, 'SENHA_ATUAL_INCORRETA', 'A senha atual está incorreta.');
    }
  } else if (usuario.trocaSenhaObrigatoria) {
    // Primeiro acesso: acabou de entrar com a senha temporária, que não pode ser reaproveitada.
    if (await conferirSenha(usuario.senhaHash, entrada.novaSenha)) {
      throw new ErroApi(400, 'SENHA_REPETIDA', 'A nova senha deve ser diferente da temporária.');
    }
  } else {
    throw new ErroApi(400, 'ENTRADA_INVALIDA', 'Informe a senha atual.');
  }

  const [atualizado] = await prisma.$transaction([
    prisma.usuario.update({
      where: { id: usuario.id },
      data: { senhaHash: await gerarHashSenha(entrada.novaSenha), trocaSenhaObrigatoria: false },
    }),
    // Encerra as outras sessões abertas com a senha antiga.
    prisma.sessao.deleteMany({ where: { usuarioId: usuario.id, id: { not: req.sessaoId } } }),
    prisma.logAuditoria.create({
      data: { acao: 'SENHA_ALTERADA', usuarioId: usuario.id, ip: req.ip },
    }),
  ]);
  res.json({ usuario: paraSessao(atualizado) });
});
