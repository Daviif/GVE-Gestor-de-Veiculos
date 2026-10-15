-- CreateEnum
CREATE TYPE "perfil" AS ENUM ('ADMINISTRADOR', 'SERVIDOR');

-- CreateEnum
CREATE TYPE "turno" AS ENUM ('MATUTINO', 'VESPERTINO');

-- CreateEnum
CREATE TYPE "status_reserva" AS ENUM ('ATIVA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "abrangencia_feriado" AS ENUM ('NACIONAL', 'ESTADUAL', 'MUNICIPAL');

-- CreateEnum
CREATE TYPE "acao_auditoria" AS ENUM ('LOGIN', 'LOGIN_FALHA', 'LOGOUT', 'SENHA_ALTERADA', 'SENHA_REDEFINIDA', 'USUARIO_CRIADO', 'USUARIO_EDITADO', 'USUARIO_ATIVADO', 'USUARIO_DESATIVADO', 'VEICULO_CRIADO', 'VEICULO_EDITADO', 'VEICULO_ATIVADO', 'VEICULO_DESATIVADO', 'RESERVA_CRIADA', 'RESERVA_CANCELADA', 'FERIADO_CRIADO', 'FERIADO_REMOVIDO', 'FERIADOS_IMPORTADOS');

-- CreateTable
CREATE TABLE "usuario" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "cpf" CHAR(11) NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "perfil" "perfil" NOT NULL DEFAULT 'SERVIDOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "troca_senha_obrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "veiculo" (
    "id" SERIAL NOT NULL,
    "placa" CHAR(7) NOT NULL,
    "modelo" VARCHAR(80) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "veiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserva" (
    "id" SERIAL NOT NULL,
    "veiculo_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "turno" "turno" NOT NULL,
    "destino" VARCHAR(200) NOT NULL,
    "status" "status_reserva" NOT NULL DEFAULT 'ATIVA',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelado_em" TIMESTAMPTZ(3),
    "cancelado_por_id" INTEGER,

    CONSTRAINT "reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feriado" (
    "id" SERIAL NOT NULL,
    "data" DATE NOT NULL,
    "descricao" VARCHAR(120) NOT NULL,
    "abrangencia" "abrangencia_feriado" NOT NULL,
    "criado_por_id" INTEGER,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feriado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_auditoria" (
    "id" BIGSERIAL NOT NULL,
    "usuario_id" INTEGER,
    "acao" "acao_auditoria" NOT NULL,
    "entidade" VARCHAR(30),
    "entidade_id" INTEGER,
    "detalhes" JSONB,
    "ip" VARCHAR(45),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_cpf_key" ON "usuario"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "veiculo_placa_key" ON "veiculo"("placa");

-- CreateIndex
CREATE INDEX "reserva_data_turno_idx" ON "reserva"("data", "turno");

-- CreateIndex
CREATE INDEX "reserva_usuario_id_data_idx" ON "reserva"("usuario_id", "data");

-- CreateIndex
CREATE UNIQUE INDEX "reserva_ativa_unica" ON "reserva"("veiculo_id", "data", "turno") WHERE (status = 'ATIVA');

-- CreateIndex
CREATE UNIQUE INDEX "feriado_data_key" ON "feriado"("data");

-- CreateIndex
CREATE INDEX "log_auditoria_criado_em_idx" ON "log_auditoria"("criado_em");

-- CreateIndex
CREATE INDEX "log_auditoria_usuario_id_criado_em_idx" ON "log_auditoria"("usuario_id", "criado_em");

-- CreateIndex
CREATE INDEX "log_auditoria_entidade_entidade_id_idx" ON "log_auditoria"("entidade", "entidade_id");

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_veiculo_id_fkey" FOREIGN KEY ("veiculo_id") REFERENCES "veiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_cancelado_por_id_fkey" FOREIGN KEY ("cancelado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feriado" ADD CONSTRAINT "feriado_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_auditoria" ADD CONSTRAINT "log_auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restrições que o Prisma não modela (escritas à mão).

-- Reserva ativa não tem dados de cancelamento; cancelada tem os dois.
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_cancelamento_check" CHECK (
    (status = 'ATIVA' AND "cancelado_em" IS NULL AND "cancelado_por_id" IS NULL)
    OR (status = 'CANCELADA' AND "cancelado_em" IS NOT NULL AND "cancelado_por_id" IS NOT NULL)
);

-- RN06: destino obrigatório, não só NOT NULL.
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_destino_check" CHECK (btrim("destino") <> '');

-- CPF guardado só com os 11 dígitos.
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_cpf_check" CHECK ("cpf" ~ '^[0-9]{11}$');

-- E-mail guardado em minúsculas, para a unicidade valer sem diferenciar caixa.
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_email_check" CHECK ("email" = lower("email"));

-- Placa antiga (ABC1234) ou Mercosul (ABC1D23), em maiúsculas e sem hífen.
ALTER TABLE "veiculo" ADD CONSTRAINT "veiculo_placa_check" CHECK ("placa" ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$');
