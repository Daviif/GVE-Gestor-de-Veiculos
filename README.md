# Gestão de Veículos — Secretaria Municipal de Educação de Barão de Cocais

Sistema web para agendamento da frota da Secretaria Municipal de Educação de Barão de Cocais (MG): servidores reservam um veículo por data e turno, e o sistema impede que o mesmo carro seja reservado duas vezes no mesmo turno.

**Dupla:** João Vitor Cota Silva e Davi Emílio de Paula Fonseca — UFOP

## Stack

| Camada | Tecnologia |
| --- | --- |
| Front-end (`web/`) | React 19 + Vite + TypeScript (.tsx) |
| Back-end (`api/`) | Node.js 22 LTS + Express + TypeScript |
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
