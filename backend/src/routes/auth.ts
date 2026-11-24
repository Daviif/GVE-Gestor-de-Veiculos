import { loginSchema, normalizarLogin, trocaSenhaSchema, type UsuarioSessao } from '@gve/shared';
import { Router } from 'express';
import { createHash } from 'node:crypto';
import { MemoryStore, rateLimit } from 'express-rate-limit';
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
  travarConta,
} from '../seguranca/sessao';

/** Bloqueio após 5 tentativas erradas em 15 min, por conta (ou pelo login digitado, se não existe). */
export const MAX_TENTATIVAS = 5;
export const JANELA_TENTATIVAS_MS = 15 * 60 * 1000;

/**
 * Falhas de login aceitas por IP a cada minuto, somando todas as contas. O bloqueio por conta
 * não segura quem tenta uma conta diferente a cada vez, e cada tentativa custa um Argon2
 * (19 MiB e CPU): sem isso, uma rajada derruba a VPS. Logins certos não contam, para não
 * barrar uma secretaria inteira que sai pelo mesmo IP.
 */
export const MAX_FALHAS_POR_IP = 20;
export const JANELA_FALHAS_POR_IP_MS = 60 * 1000;

/** Em memória: basta para uma instância só da API. Exportado para os testes zerarem. */
export const falhasPorIp = new MemoryStore();

const limitarFalhasPorIp = rateLimit({
  windowMs: JANELA_FALHAS_POR_IP_MS,
  limit: MAX_FALHAS_POR_IP,
  skipSuccessfulRequests: true,
  store: falhasPorIp,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(
      new ErroApi(
        429,
        'MUITAS_TENTATIVAS',
        'Muitas tentativas de login sem sucesso a partir desta rede. Aguarde 1 minuto.',
      ),
    );
  },
});

const CREDENCIAIS_INVALIDAS = 'E-mail/CPF ou senha incorretos.';

function erroBloqueio(liberaEm: Date, agora: number): ErroApi {
  const minutos = Math.max(1, Math.ceil((liberaEm.getTime() - agora) / 60_000));
  return new ErroApi(
    429,
    'LOGIN_BLOQUEADO',
    `Muitas tentativas sem sucesso. Tente novamente em ${minutos} min.`,
  );
}

/**
 * O que vai para a auditoria quando o login digitado não existe. E-mail ou CPF bem formados
 * ficam legíveis (mostram quem está sendo atacado); qualquer outra coisa pode ser a senha
 * digitada no campo errado, então só o hash é gravado. É determinístico: a contagem de
 * falhas por login inexistente (bloqueadoAte) continua funcionando.
 */
function loginParaAuditoria(login: { tipo: 'email' | 'cpf'; valor: string }): string {
  const bemFormado =
    login.tipo === 'email'
      ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(login.valor)
      : login.valor.length === 11;
  if (bemFormado) return login.valor;
  return `sha256:${createHash('sha256').update(login.valor).digest('hex')}`;
}

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
  usuario: Pick<Usuario, 'id'> | null,
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

rotasAuth.post('/login', limitarFalhasPorIp, async (req, res) => {
  const entrada = loginSchema.parse(req.body);
  const login = normalizarLogin(entrada.login);
  const agora = Date.now();

  const encontrado = login.valor
    ? await prisma.usuario.findUnique({
        where: login.tipo === 'email' ? { email: login.valor } : { cpf: login.valor },
        select: { id: true, senhaHash: true },
      })
    : null;
  const loginAuditado = loginParaAuditoria(login);

  // O Argon2 (19 MiB, centenas de ms) roda antes da transação: dentro dela prenderia uma
  // conexão do pool enquanto calcula, e um pico de logins pararia o resto da API.
  // Login inexistente confere um hash fictício, para a resposta levar o mesmo tempo.
  hashFicticio ??= gerarHashSenha('senha-ficticia');
  const senhaConfere = await conferirSenha(
    encontrado?.senhaHash ?? (await hashFicticio),
    entrada.senha,
  );

  // Tentativas na mesma conta (ou no mesmo login inexistente) passam uma de cada vez:
  // conferir o bloqueio, decidir e gravar a falha ou abrir a sessão é atômico. Sem isso,
  // várias tentativas em paralelo veriam a contagem antiga e passariam do limite.
  const resultado = await prisma.$transaction(
    async (tx) => {
      await travarConta(tx, encontrado?.id ?? login.valor);
      // Relido com a conta travada: uma redefinição de senha ou desativação que terminou
      // enquanto esta tentativa esperava já vale aqui.
      const usuario = encontrado
        ? await tx.usuario.findUnique({ where: { id: encontrado.id } })
        : null;

      const falha = async (motivo: string, erroApi: ErroApi) => {
        await registrarAuditoria(tx, {
          acao: 'LOGIN_FALHA',
          usuarioId: usuario?.id ?? null,
          detalhes: usuario ? { motivo } : { motivo, login: loginAuditado },
          ip: req.ip,
        });
        return { erro: erroApi };
      };

      // O bloqueio é conferido antes de usar o resultado da senha: bloqueado, nem a certa entra.
      const liberaEm = await bloqueadoAte(tx, usuario, loginAuditado, agora);
      if (liberaEm) return falha('BLOQUEADO', erroBloqueio(liberaEm, agora));

      // Senha redefinida enquanto esta tentativa esperava a trava: o que foi conferido
      // antes era o hash antigo e não vale mais.
      if (!usuario || !senhaConfere || usuario.senhaHash !== encontrado?.senhaHash) {
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
      await registrarAuditoria(tx, { acao: 'LOGIN', usuarioId: usuario.id, ip: req.ip });
      // Também com o lock: uma redefinição de senha na fila encerra esta sessão junto com as outras.
      return { usuario, token: await abrirSessao(usuario.id, tx) };
    },
    // Tentativas na fila esperam o lock dentro da transação; o padrão de 5 s é curto para isso.
    // Com o Argon2 fora, cada uma segura a trava só pelo tempo de algumas consultas.
    { maxWait: 10_000, timeout: 30_000 },
  );
  // O erro sai depois do commit, para a falha ficar gravada.
  if ('erro' in resultado) throw resultado.erro;

  gravarCookieSessao(res, resultado.token);
  res.json({ usuario: paraSessao(resultado.usuario) });
});

/** Funciona mesmo com a sessão vencida: o objetivo é só apagar o cookie. */
rotasAuth.post('/logout', async (req, res) => {
  const token = lerTokenSessao(req);
  const usuarioId = token ? await encerrarSessao(token) : null;
  if (usuarioId) await registrarAuditoria(prisma, { acao: 'LOGOUT', usuarioId, ip: req.ip });
  apagarCookieSessao(res);
  res.status(204).end();
});

rotasAuth.get('/me', autenticar({ permitirTrocaPendente: true }), (req, res) => {
  res.json({ usuario: paraSessao(req.usuario!) });
});

rotasAuth.put('/senha', autenticar({ permitirTrocaPendente: true }), async (req, res) => {
  const entrada = trocaSenhaSchema.parse(req.body);
  const usuario = req.usuario!;
  const agora = Date.now();

  // Argon2 antes da transação, como no login (não prende conexão enquanto calcula).
  let senhaAtualConfere: boolean | undefined;
  if (entrada.senhaAtual !== undefined) {
    senhaAtualConfere = await conferirSenha(usuario.senhaHash, entrada.senhaAtual);
  } else if (usuario.trocaSenhaObrigatoria) {
    // Primeiro acesso: acabou de entrar com a senha temporária, que não pode ser reaproveitada.
    if (await conferirSenha(usuario.senhaHash, entrada.novaSenha)) {
      throw new ErroApi(
        400,
        'SENHA_REPETIDA',
        'A nova senha deve ser diferente da temporária.',
        'novaSenha',
      );
    }
  } else {
    throw new ErroApi(400, 'ENTRADA_INVALIDA', 'Informe a senha atual.');
  }
  const senhaHash = senhaAtualConfere === false ? null : await gerarHashSenha(entrada.novaSenha);

  const resultado = await prisma.$transaction(async (tx) => {
    await travarConta(tx, usuario.id);
    const atual = await tx.usuario.findUniqueOrThrow({ where: { id: usuario.id } });

    // RC06: quem roubou o cookie não pode adivinhar a senha atual aqui sem limite. Errar
    // conta como falha de login; chegando ao bloqueio, todas as sessões da conta caem.
    const bloquear = async (liberaEm: Date) => {
      await tx.sessao.deleteMany({ where: { usuarioId: usuario.id } });
      return { erro: erroBloqueio(liberaEm, agora), sessaoEncerrada: true };
    };
    const jaBloqueado = await bloqueadoAte(tx, atual, '', agora);
    if (jaBloqueado) return bloquear(jaBloqueado);

    const errou =
      senhaAtualConfere !== undefined &&
      (!senhaAtualConfere || atual.senhaHash !== usuario.senhaHash);
    if (errou || !senhaHash) {
      await registrarAuditoria(tx, {
        acao: 'LOGIN_FALHA',
        usuarioId: usuario.id,
        detalhes: { motivo: 'SENHA_ATUAL' },
        ip: req.ip,
      });
      const liberaEm = await bloqueadoAte(tx, atual, '', agora);
      if (liberaEm) return bloquear(liberaEm);
      return {
        erro: new ErroApi(
          400,
          'SENHA_ATUAL_INCORRETA',
          'A senha atual está incorreta.',
          'senhaAtual',
        ),
        sessaoEncerrada: false,
      };
    }

    const salvo = await tx.usuario.update({
      where: { id: usuario.id },
      data: { senhaHash, trocaSenhaObrigatoria: false },
    });
    // Encerra as outras sessões abertas com a senha antiga.
    await tx.sessao.deleteMany({ where: { usuarioId: usuario.id, id: { not: req.sessaoId } } });
    await registrarAuditoria(tx, { acao: 'SENHA_ALTERADA', usuarioId: usuario.id, ip: req.ip });
    return { usuario: salvo };
  });
  // O erro sai depois do commit, para a falha ficar gravada.
  if ('erro' in resultado) {
    if (resultado.sessaoEncerrada) apagarCookieSessao(res);
    throw resultado.erro;
  }
  res.json({ usuario: paraSessao(resultado.usuario) });
});
