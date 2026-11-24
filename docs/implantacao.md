# Implantação no servidor (veiculos.smebc.com.br)

O servidor tem um Caddy no host (portas 80/443, HTTPS automático) que repassa o domínio para
`127.0.0.1:8001`. Nós só rodamos os contêineres; o Caddy não é alterado.

```
Internet → Caddy (80/443) → 127.0.0.1:8001 → web (Nginx) ─┬→ frontend estático
                                                          └→ /api → api:3333 → db:5432
```

Só o `web` publica porta. `api` e `db` ficam em rede interna (o banco não tem saída para a internet).
Os cabeçalhos de segurança (CSP, HSTS, X-Frame-Options…) saem do Nginx do `web`.

## Passos (cada um com sua verificação)

Use `C="docker compose -f docker-compose.prod.yml --env-file .env.production"`.

1. **Código no servidor** (`git clone`, branch `main`). Verifique: `git log -1`.
2. **Segredos**: `cp .env.production.example .env.production`, preencha `POSTGRES_PASSWORD`
   (`openssl rand -base64 24`) e os dados do administrador. `chmod 600 .env.production`.
3. **Subir**: `$C up -d --build`. Verifique: `$C ps` mostra `db` (healthy), `api` e `web` Up.
4. **Migrar e criar o administrador**:
   `$C run --rm migrar` e `$C run --rm migrar npm run db:seed -w backend`.
   Verifique: "All migrations have been successfully applied".
5. **Saúde local**: `curl -s localhost:8001/api/v1/saude` → `{"status":"ok"}`.
6. **Saúde pública**: `curl -sI https://veiculos.smebc.com.br` → `HTTP/2 200` (antes do passo 3 dava 502)
   com os cabeçalhos `Content-Security-Policy` e `Strict-Transport-Security`.
7. **Login** pelo navegador com o administrador do passo 2; o sistema pede a troca de senha.
8. **Reinício**: confirmar com o técnico que o serviço do Docker sobe no boot
   (`systemctl is-enabled docker`); os contêineres têm `restart: unless-stopped`.

## Atualizar

`git pull && $C up -d --build && $C run --rm migrar`.

## Voltar atrás

`git checkout <commit-anterior> && $C up -d --build`. O volume `db-data` não é tocado; migrações
já aplicadas não são desfeitas (restaure um backup se for preciso).

## Pendente

- Backup do Postgres (`pg_dump` agendado, cifrado, com restauração testada): issue própria.
- `docker compose -f docker-compose.prod.yml` usa o projeto `gve-prod`, separado do `gve` de dev
  (mesmo nome faria o Compose reaproveitar o contêiner e o volume do banco de desenvolvimento).
