# Frontend do GVE: build do Vite + Nginx sem root (contexto de build: raiz do repositório).
FROM node:22.23.4-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc tsconfig.base.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --ignore-scripts
COPY shared shared
COPY frontend frontend
RUN npm run build -w frontend

FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24
COPY frontend/nginx/seguranca.conf /etc/nginx/seguranca.conf
COPY frontend/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
