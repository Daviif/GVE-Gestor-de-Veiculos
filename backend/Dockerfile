# Backend do GVE (contexto de build: raiz do repositório).
# Estágios: deps -> build (também usado para migrar/semear) -> prod-deps -> final.
FROM node:22.23.4-alpine3.24 AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc tsconfig.base.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
# --ignore-scripts: o postinstall (prisma generate) precisa do schema, que ainda não foi copiado.
RUN npm ci --ignore-scripts

FROM deps AS build
COPY shared shared
COPY backend backend
RUN npm run postinstall -w backend && npm run build -w backend
# Migrações e seed rodam neste estágio (têm o CLI do Prisma e o tsx):
#   docker compose run --rm migrar
CMD ["npm", "run", "db:deploy", "-w", "backend"]

FROM node:22.23.4-alpine3.24 AS prod-deps
WORKDIR /app
COPY package.json package-lock.json .npmrc tsconfig.base.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev --ignore-scripts -w backend --include-workspace-root=false

FROM node:22.23.4-alpine3.24 AS final
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S -g 10001 gve && adduser -S -u 10001 -G gve -H -s /sbin/nologin gve
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=build /app/backend/dist backend/dist
COPY backend/package.json backend/package.json
USER 10001
WORKDIR /app/backend
EXPOSE 3333
CMD ["node", "dist/server.js"]
