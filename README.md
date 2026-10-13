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
| `feat/<tarefa>`, `fix/<tarefa>` | Uma branch por tarefa do quadro, criada a partir de `dev`. |

Fluxo: `feat/*` → PR para `dev` → testes de homologação → PR de `dev` para `main`.

## Acompanhamento

As tarefas (a fazer, em andamento, concluídas) ficam no GitHub Projects do repositório. Cada tarefa é uma issue; o PR que a resolve deve citar `Closes #<número>`.

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
| `npm run db:down` | Para o banco |
