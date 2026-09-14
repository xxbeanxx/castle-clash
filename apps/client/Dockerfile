# syntax=docker/dockerfile:1

# corepack isn't reliably bundled across node:24-alpine builds (it's being
# phased out of Node core), so pin pnpm/turbo via npm instead.
FROM node:24-alpine AS base
RUN npm install -g pnpm@12.4.1 turbo@2.10.13

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @castle-clash/client --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=installer /app/ .
COPY --from=pruner /app/out/full/ .
RUN turbo build --filter=@castle-clash/client

FROM nginxinc/nginx-unprivileged:1.30-alpine AS runtime
COPY --from=builder /app/apps/client/build/client /usr/share/nginx/html
COPY apps/client/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/client/docker/entrypoint.sh /docker-entrypoint.d/40-render-config.sh
EXPOSE 8080
