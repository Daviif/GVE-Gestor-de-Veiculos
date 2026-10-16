import { situacaoUsuarioSchema, usuarioSchema, type Usuario } from '@gve/shared';
import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db';
import { Prisma } from '../generated/prisma/client';
import { autenticar, exigirPerfil } from '../middleware/autenticacao';
import { ErroApi } from '../middleware/erros';
import { gerarHashSenha } from '../seguranca/senha';

// Sem a senha nem o hash: nunca sai da API.
const campos = {
  id: true,
  nome: true,
  email: true,
  cpf: true,
  perfil: true,
  ativo: true,
  trocaSenhaObrigatoria: true,
} as const;

// Alfabeto sem caracteres ambíguos (0/O, 1/l/I) para a senha ser fácil de repassar.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export const rotasUsuarios = Router();

// Toda a administração de usuários é exclusiva do administrador (RNF08, RN08).
rotasUsuarios.use(autenticar(), exigirPerfil('ADMINISTRADOR'));

/** Senha temporária de 10 caracteres; o usuário é obrigado a trocá-la no 1º acesso (RF04). */
function gerarSenhaProvisoria(): string {
  let senha = '';
  for (let i = 0; i < 10; i++) senha += ALFABETO[randomInt(ALFABETO.length)];
  return senha;
}

/** Busca o usuário do :id da rota ou responde 404. */
async function buscarUsuario(idParam: unknown): Promise<Usuario> {
  const id = z.coerce.number().int().positive().safeParse(idParam);
  const usuario = id.success
    ? await prisma.usuario.findUnique({ where: { id: id.data }, select: campos })
    : null;
  if (!usuario) throw new ErroApi(404, 'NAO_ENCONTRADO', 'Usuário não encontrado.');
  return usuario;
}

/** E-mail e CPF são únicos (RN08). Aponta qual deles já existe antes de tentar gravar. */
async function verificarConflito(
  tx: Prisma.TransactionClient,
  entrada: { email: string; cpf: string },
  ignorarId?: number,
): Promise<void> {
  const existente = await tx.usuario.findFirst({
    where: {
      ...(ignorarId === undefined ? {} : { id: { not: ignorarId } }),
      OR: [{ email: entrada.email }, { cpf: entrada.cpf }],
    },
    select: { cpf: true },
  });
  if (!existente) return;
  if (existente.cpf === entrada.cpf) {
    throw new ErroApi(409, 'CPF_DUPLICADO', 'Já existe um usuário com esse CPF.');
  }
  throw new ErroApi(409, 'EMAIL_DUPLICADO', 'Já existe um usuário com esse e-mail.');
}

/** Rede de segurança para a corrida entre dois cadastros simultâneos (o índice único do banco). */
function traduzirDuplicidade(erro: unknown): void {
  if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
    throw new ErroApi(409, 'DADOS_DUPLICADOS', 'E-mail ou CPF já cadastrado.');
  }
}

rotasUsuarios.get('/', async (_req, res) => {
  const usuarios = await prisma.usuario.findMany({
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    select: campos,
  });
  res.json({ usuarios });
});

rotasUsuarios.post('/', async (req, res) => {
  const entrada = usuarioSchema.parse(req.body);
  const senhaProvisoria = gerarSenhaProvisoria();

  try {
    const usuario = await prisma.$transaction(async (tx) => {
      await verificarConflito(tx, entrada);
      const criado = await tx.usuario.create({
        data: { ...entrada, senhaHash: await gerarHashSenha(senhaProvisoria) },
        select: campos,
      });
      await tx.logAuditoria.create({
        data: {
          acao: 'USUARIO_CRIADO',
          usuarioId: req.usuario!.id,
          entidade: 'usuario',
          entidadeId: criado.id,
          detalhes: { nome: entrada.nome, email: entrada.email, perfil: entrada.perfil },
          ip: req.ip,
        },
      });
      return criado;
    });
    res.status(201).json({ usuario, senhaProvisoria });
  } catch (erro) {
    traduzirDuplicidade(erro);
    throw erro;
  }
});

rotasUsuarios.put('/:id', async (req, res) => {
  const anterior = await buscarUsuario(req.params.id);
  const entrada = usuarioSchema.parse(req.body);

  try {
    const usuario = await prisma.$transaction(async (tx) => {
      await verificarConflito(tx, entrada, anterior.id);
      const editado = await tx.usuario.update({
        where: { id: anterior.id },
        data: entrada,
        select: campos,
      });
      await tx.logAuditoria.create({
        data: {
          acao: 'USUARIO_EDITADO',
          usuarioId: req.usuario!.id,
          entidade: 'usuario',
          entidadeId: anterior.id,
          detalhes: {
            antes: { nome: anterior.nome, email: anterior.email, perfil: anterior.perfil },
            depois: { nome: entrada.nome, email: entrada.email, perfil: entrada.perfil },
          },
          ip: req.ip,
        },
      });
      return editado;
    });
    res.json({ usuario });
  } catch (erro) {
    traduzirDuplicidade(erro);
    throw erro;
  }
});

/** Desativa ou reativa o acesso (RN10). Desativar não exclui, mas encerra as sessões abertas. */
rotasUsuarios.patch('/:id/situacao', async (req, res) => {
  const atual = await buscarUsuario(req.params.id);
  const { ativo } = situacaoUsuarioSchema.parse(req.body);

  if (!ativo && atual.id === req.usuario!.id) {
    throw new ErroApi(409, 'OPERACAO_INVALIDA', 'Você não pode desativar o seu próprio acesso.');
  }
  if (atual.ativo === ativo) {
    res.json({ usuario: atual });
    return;
  }

  const usuario = await prisma.$transaction(async (tx) => {
    const atualizado = await tx.usuario.update({
      where: { id: atual.id },
      data: { ativo },
      select: campos,
    });
    if (!ativo) await tx.sessao.deleteMany({ where: { usuarioId: atual.id } });
    await tx.logAuditoria.create({
      data: {
        acao: ativo ? 'USUARIO_ATIVADO' : 'USUARIO_DESATIVADO',
        usuarioId: req.usuario!.id,
        entidade: 'usuario',
        entidadeId: atual.id,
        detalhes: { nome: atual.nome },
        ip: req.ip,
      },
    });
    return atualizado;
  });
  res.json({ usuario });
});

/** Gera uma nova senha provisória (RF04). O usuário troca no próximo login e perde as sessões abertas. */
rotasUsuarios.post('/:id/redefinir-senha', async (req, res) => {
  const usuario = await buscarUsuario(req.params.id);
  const senhaProvisoria = gerarSenhaProvisoria();

  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id: usuario.id },
      data: { senhaHash: await gerarHashSenha(senhaProvisoria), trocaSenhaObrigatoria: true },
    });
    // A senha antiga não vale mais: encerra as sessões abertas.
    await tx.sessao.deleteMany({ where: { usuarioId: usuario.id } });
    await tx.logAuditoria.create({
      data: {
        acao: 'SENHA_REDEFINIDA',
        usuarioId: req.usuario!.id,
        entidade: 'usuario',
        entidadeId: usuario.id,
        detalhes: { nome: usuario.nome },
        ip: req.ip,
      },
    });
  });
  res.json({ senhaProvisoria });
});
