# Gestão de Veículos — Secretaria Municipal de Educação de Barão de Cocais

Sistema web para agendamento da frota da Secretaria Municipal de Educação de Barão de Cocais (MG): servidores reservam um veículo por data e turno, e o sistema impede que o mesmo carro seja reservado duas vezes no mesmo turno.

**Equipe:** João Vitor Cota Silva e Davi Emílio de Paula Fonseca.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Front-end (`frontend/`) | React 19 + Vite + TypeScript (.tsx) |
| Back-end (`backend/`) | Node.js 22 LTS + Express + TypeScript |
| Banco | PostgreSQL 16 + Prisma ORM |
| Validação | Zod (compartilhado entre front e back) |
| Implantação | Docker Compose, Nginx, Let's Encrypt |

## Branches

| Branch | Uso |
| --- | --- |
| `main` | Versão final, estável. Recebe apenas merges vindos de `dev`. |
| `dev` | Homologação. Recebe os pull requests das branches de tarefa. |
| `feat/<nº>-<descrição>`, `fix/<nº>-<descrição>` | Uma branch por issue do quadro, criada a partir de `dev` (ex.: `feat/10-autenticacao`). |

Fluxo: `feat/*` → PR para `dev` → testes de homologação → PR de `dev` para `main`.

## Acompanhamento

As tarefas ficam no GitHub Projects do repositório, uma issue por tarefa. O Status é atualizado automaticamente (`.github/workflows/quadro.yml`):

| Evento | Status da issue |
| --- | --- |
| Issue criada | Backlog |
| Branch `feat/<nº>-…` criada ou PR para `dev` aberto | Em andamento |
| PR mesclado em `dev` | Em homologação (dev) |
| PR de `dev` mesclado em `main` | Concluído (main) para tudo que estava em homologação, e as issues são fechadas |
| PR de hotfix mesclado em `main` | Concluído (main) só para as issues citadas no PR |

O PR deve citar a issue com `Closes #<nº>` (o modelo de PR já traz a linha). Mover para "A fazer" é manual: é a priorização da equipe.

Todo PR para `dev` ou `main` passa pelo CI (`.github/workflows/ci.yml`): formatação, lint, tipos, testes e build.

## Estrutura

```
backend/    API REST (Express + TypeScript)
frontend/   Interface (React + Vite + TypeScript)
shared/     Esquemas Zod e tipos usados pelos dois
```

## Desenvolvimento

Pré-requisitos: Node.js 22.13 ou superior e Docker.

```bash
cp .env.example .env     # variáveis locais
npm install              # instala backend, frontend e shared
npm run db:up            # sobe o PostgreSQL no Docker
npm run db:migrate       # aplica as migrações
npm run db:seed          # cria o administrador e 3 veículos de exemplo
npm run dev              # backend em :3333 e frontend em :5173
```

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Backend e frontend com recarga automática |
| `npm test` | Testes de todos os pacotes (Vitest) |
| `npm run typecheck` | Verificação de tipos |
| `npm run lint` | ESLint |
| `npm run format` | Formata o código com Prettier |
| `npm run build` | Build de produção (`backend/dist` e `frontend/dist`) |
| `npm run db:migrate` | Aplica as migrações e regenera o cliente Prisma; com `-- --name <nome>`, cria uma nova a partir do `schema.prisma` |
| `npm run db:seed` | Administrador (`admin@gve.local` / `admin123`, troca no 1º acesso) e veículos de exemplo |
| `npm run db:reset` | Apaga o banco local, reaplica as migrações e roda o seed |
| `npm run db:studio` | Abre o Prisma Studio para ver os dados |
| `npm run db:down` | Para o banco |
