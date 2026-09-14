# Castle Clash

A 2D Renaissance knight arena brawler. TypeScript monorepo: an authoritative Colyseus server, a
React Router + PixiJS client, and Supabase for auth and persistence.

See [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) for the architecture and the
phase-by-phase build plan, and [`docs/adr/`](docs/adr) for recorded decisions.

## Prerequisites

- Node 24 (see `.nvmrc`)
- pnpm 12, pinned via the root `package.json`'s `packageManager` field. If `corepack` isn't
  available (it isn't bundled with every Node distribution), install it directly instead:
  `npm install -g pnpm@12.4.1`.

## Getting started

```sh
pnpm install
pnpm dev          # runs apps/server and apps/client together, via turbo
```

## Common commands

Run from the repo root; turbo scopes each task to the packages that need it.

```sh
pnpm lint         # eslint across the workspace
pnpm typecheck    # tsc --noEmit in every package
pnpm test         # vitest in every package
pnpm build        # build packages/shared, then apps/server and apps/client
pnpm verify       # lint + typecheck + test + build, in that order
```

Scope any of these to one package with `--filter`, e.g. `pnpm --filter @castle-clash/server test`.

## Repository layout

```
apps/
  server/   # Colyseus authoritative server
  client/   # React Router (SPA) + PixiJS
packages/
  shared/   # isomorphic gameplay rules, types, and math — no DOM, no Node
docs/
  IMPLEMENTATION_PLAN.md
  adr/
  research/
```

## Docker

Each app has its own `Dockerfile`, but the build context is the **repo root** (both Dockerfiles
run `turbo prune` against the full workspace):

```sh
docker build -f apps/server/Dockerfile -t castle-clash-server .
docker build -f apps/client/Dockerfile -t castle-clash-client .
```

The client image needs `GAME_SERVER_URL`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY` at
container start; it renders them into `config.js` and refuses to start if any are missing.
