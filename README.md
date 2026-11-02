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

## Pré-requisitos

| Ferramenta | Versão | Para quê |
| --- | --- | --- |
| [Node.js](https://nodejs.org/) | 22.13 ou superior (o `.nvmrc` fixa a 22) | Backend, frontend e scripts. O npm vem junto. |
| [Docker](https://www.docker.com/) com Docker Compose | qualquer versão recente | Sobe o PostgreSQL 16 de desenvolvimento e de testes |
| Git | qualquer | Clonar o repositório |

No Windows, use o Docker Desktop (com WSL 2) e deixe-o aberto antes de `npm run db:up`. Quem já tem um PostgreSQL 16 instalado pode dispensar o Docker: basta apontar `DATABASE_URL` para ele.

## Como rodar em desenvolvimento

```bash
git clone https://github.com/Daviif/GVE-Gestor-de-Veiculos.git
cd GVE-Gestor-de-Veiculos
cp .env.example .env     # variáveis locais (os valores padrão já funcionam)
npm install              # instala backend, frontend e shared e gera o cliente Prisma
npm run db:up            # sobe o PostgreSQL no Docker
npm run db:migrate       # aplica as migrações
npm run db:seed          # cria o administrador e 3 veículos de exemplo
npm run dev              # backend em :3333 e frontend em :5173
```

Abra <http://localhost:5173> e entre com `admin@gve.local` e a senha `admin123`. No primeiro acesso o sistema pede uma senha nova. O frontend também abre em outro aparelho da mesma rede, pelo IP da máquina na porta 5173.

Em desenvolvimento, o Vite encaminha as chamadas a `/api` para o backend (`frontend/vite.config.ts`), então frontend e API ficam na mesma origem e o cookie de sessão funciona sem configuração extra.

## Variáveis de ambiente

Ficam no `.env` da raiz, lido pelo backend, pelo Prisma, pelos testes e pelo `docker-compose.yml`. O `.env` não vai para o Git; o `.env.example` é o modelo. Em produção, as variáveis podem vir do próprio ambiente em vez do arquivo.

| Variável | Padrão | Uso |
| --- | --- | --- |
| `POSTGRES_USER` | `gve` | Usuário do PostgreSQL criado pelo Docker |
| `POSTGRES_PASSWORD` | `gve` | Senha desse usuário |
| `POSTGRES_DB` | `gve` | Banco criado pelo Docker |
| `POSTGRES_PORT` | `5432` | Porta do PostgreSQL na máquina (troque se a 5432 já estiver em uso) |
| `DATABASE_URL` | `postgresql://gve:gve@localhost:5432/gve` | Conexão usada pelo backend e pelo Prisma. Precisa bater com as quatro acima. |
| `DATABASE_URL_TESTE` | o mesmo servidor de `DATABASE_URL`, banco `gve_teste` | Banco dos testes do backend. Só defina se quiser outro servidor. |
| `API_PORT` | `3333` | Porta do backend |
| `NODE_ENV` | `development` | Em `production`, o cookie de sessão passa a exigir HTTPS (`Secure`) e o backend confia no `X-Forwarded-For` do Nginx para registrar o IP na auditoria |
| `BRASILAPI_URL` | `https://brasilapi.com.br/api` | API usada para importar os feriados nacionais |
| `SEED_ADMIN_NOME` | `Administrador` | Nome do administrador criado pelo seed |
| `SEED_ADMIN_EMAIL` | `admin@gve.local` | E-mail (login) do administrador |
| `SEED_ADMIN_CPF` | `52998224725` | CPF do administrador (11 dígitos, sem pontuação) |
| `SEED_ADMIN_SENHA` | `admin123` fora de produção | Senha inicial do administrador, de 8 a 128 caracteres. **Obrigatória em produção.** |

O seed não sobrescreve nada: se o administrador já existe, a senha dele continua a mesma.

## Como rodar os testes

```bash
npm run db:up    # os testes do backend precisam do PostgreSQL no ar
npm test         # shared, backend e frontend (Vitest)
```

- **Backend:** testa a API de verdade (supertest) contra o banco `gve_teste`, que é criado e migrado automaticamente no mesmo PostgreSQL do desenvolvimento. Os dados do banco `gve` não são tocados. Os arquivos rodam um de cada vez, porque compartilham o banco.
- **Frontend:** testa as telas em jsdom (Testing Library), com a API simulada. Não precisa de banco.
- **Shared:** testa os esquemas de validação (Zod).

Para rodar só um pacote ou só um arquivo:

```bash
npm test -w backend                 # só o backend
npm test -w backend -- reservas     # só os arquivos do backend com "reservas" no nome
```

Antes de abrir um PR, rode o mesmo que o CI: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`.

## Build de produção

```bash
npm ci           # instalação limpa, exatamente como no package-lock.json
npm run build    # gera backend/dist/server.js e frontend/dist/
```

| Saída | O que é | Como servir |
| --- | --- | --- |
| `backend/dist/server.js` | A API inteira num arquivo só (o pacote `shared` vai embutido) | `NODE_ENV=production node backend/dist/server.js`. Ainda usa o `node_modules` (Prisma, Argon2, Express). |
| `frontend/dist/` | HTML, JS, CSS e fontes estáticos | Qualquer servidor de arquivos. Em produção, o Nginx serve a pasta e encaminha `/api` para o backend. |

Ordem para subir uma versão nova:

1. Configure as variáveis de ambiente de produção, com `NODE_ENV=production`, uma senha forte no banco e `SEED_ADMIN_SENHA`.
2. `npm ci` e `npm run build`.
3. Aplique as migrações sem gerar novas: `npm run db:deploy -w backend`.
4. Só na primeira instalação: `npm run db:seed` (cria o administrador; os veículos de exemplo podem ser desativados depois).
5. Inicie o backend com `NODE_ENV=production node backend/dist/server.js` e confira <http://localhost:3333/api/v1/saude>, que deve responder `{"status":"ok"}`.
6. Publique o `frontend/dist/` atrás do Nginx, com HTTPS. Sem HTTPS o navegador descarta o cookie de sessão e ninguém consegue entrar.

Os passos 3 e 4 usam o Prisma CLI e o `tsx`, que são dependências de desenvolvimento: por isso a instalação é com `npm ci`, e não com `npm ci --omit=dev`.

Para conferir o build na própria máquina, com o backend de produção rodando, use `npm run preview -w frontend`: ele serve o `frontend/dist/` em <http://localhost:4173> e encaminha `/api` para a porta 3333.

A implantação na VPS (Docker, Nginx, HTTPS e backup) é descrita na issue #23.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Backend e frontend com recarga automática |
| `npm test` | Testes de todos os pacotes (Vitest). Os do backend usam o banco `gve_teste`, criado no mesmo PostgreSQL: rode `npm run db:up` antes |
| `npm run typecheck` | Verificação de tipos |
| `npm run lint` | ESLint |
| `npm run format` | Formata o código com Prettier |
| `npm run build` | Build de produção (`backend/dist` e `frontend/dist`) |
| `npm run format:check` | Confere a formatação sem alterar nada (o que o CI roda) |
| `npm run db:deploy -w backend` | Aplica as migrações existentes sem criar novas (produção) |
| `npm run db:migrate` | Aplica as migrações e regenera o cliente Prisma; com `-- --name <nome>`, cria uma nova a partir do `schema.prisma` |
| `npm run db:seed` | Administrador (`admin@gve.local` / `admin123`, troca no 1º acesso) e veículos de exemplo |
| `npm run db:reset` | Apaga o banco local, reaplica as migrações e roda o seed |
| `npm run db:studio` | Abre o Prisma Studio para ver os dados |
| `npm run db:down` | Para o banco |

## Problemas comuns

| Sintoma | Causa e solução |
| --- | --- |
| `npm run db:up` falha com "failed to connect to the docker API" | O Docker não está rodando. Abra o Docker Desktop, espere ele iniciar e rode de novo. |
| O banco não sobe porque a porta 5432 está em uso | Já existe outro PostgreSQL na máquina. Troque `POSTGRES_PORT` e a porta da `DATABASE_URL` no `.env` (ex.: 5433). |
| Testes do backend falham com erro de conexão | O PostgreSQL não está no ar: `npm run db:up`. |
| Erro dizendo que um pacote não foi encontrado depois de atualizar a branch | Alguém adicionou uma dependência: rode `npm install` de novo. |
| O backend reclama de tabela ou coluna inexistente | Há migração nova: `npm run db:migrate`. |
| Não consigo entrar com `admin123` | O administrador já trocou a senha. Em desenvolvimento, `npm run db:reset` recria o banco do zero (apaga todos os dados locais). |
