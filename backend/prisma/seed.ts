// Seed idempotente: pode rodar várias vezes sem duplicar nem sobrescrever dados.
// Uso: npm run db:seed (o db:reset também roda; no Prisma 7 o seed não é automático).

import { SENHA_MAX, SENHA_MIN } from '@gve/shared';
import { config } from '../src/config';
import { prisma } from '../src/db';
import { gerarHashSenha } from '../src/seguranca/senha';

const admin = {
  nome: process.env.SEED_ADMIN_NOME || 'Administrador',
  email: (process.env.SEED_ADMIN_EMAIL || 'admin@gve.local').toLowerCase(),
  cpf: process.env.SEED_ADMIN_CPF || '52998224725',
  senha: process.env.SEED_ADMIN_SENHA || undefined,
};

// Placas fictícias, só para desenvolvimento. Em produção a frota é cadastrada pelo administrador.
const veiculosDeExemplo = [
  { placa: 'GVE1A23', modelo: 'Fiat Argo' },
  { placa: 'GVE2B34', modelo: 'Chevrolet Onix Plus' },
  { placa: 'GVE3C45', modelo: 'Volkswagen Polo' },
];

async function main() {
  if (!admin.senha && config.NODE_ENV === 'production') {
    throw new Error('Defina SEED_ADMIN_SENHA para criar o administrador em produção.');
  }
  // Fora desse intervalo o login recusa a senha e o administrador não consegue entrar.
  if (admin.senha && (admin.senha.length < SENHA_MIN || admin.senha.length > SENHA_MAX)) {
    throw new Error(`SEED_ADMIN_SENHA precisa ter de ${SENHA_MIN} a ${SENHA_MAX} caracteres.`);
  }

  // update vazio: um administrador que já existe mantém a senha que trocou.
  await prisma.usuario.upsert({
    where: { email: admin.email },
    update: {},
    create: {
      nome: admin.nome,
      email: admin.email,
      cpf: admin.cpf,
      senhaHash: await gerarHashSenha(admin.senha ?? 'admin123'),
      perfil: 'ADMINISTRADOR',
      trocaSenhaObrigatoria: true,
    },
  });
  console.log(`Administrador: ${admin.email}`);

  if (config.NODE_ENV !== 'production') {
    for (const veiculo of veiculosDeExemplo) {
      await prisma.veiculo.upsert({ where: { placa: veiculo.placa }, update: {}, create: veiculo });
    }
    console.log(`Veículos de exemplo: ${veiculosDeExemplo.map((v) => v.placa).join(', ')}`);
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
