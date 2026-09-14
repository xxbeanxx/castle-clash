# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A 2D Renaissance knight arena brawler: an authoritative Colyseus server, a React Router + PixiJS
client, and Supabase for auth/persistence, in a pnpm + Turborepo monorepo.

**`docs/IMPLEMENTATION_PLAN.md` is the source of truth** for architecture and the phase-by-phase
build order — read it before making structural changes. It's being implemented phase by phase;
check its "Phase N" sections against what actually exists in the tree to see how far the build has
gotten (as of this writing: Phase 1, Foundation, is done — `packages/shared` only has
`config/`, `types/`, `input/`, `math/`, and a placeholder `testing/`; no Colyseus room, schema, or
sim code exists yet). `docs/adr/` records specific decisions (currently just ADR 0001, the
isomorphic-sim boundary); `docs/research/` records version/API facts verified against live docs
mid-implementation — check it before trusting a version number stated in the plan's prose, since
several were wrong when written (pnpm "10" vs the actual 12, Colyseus's server bootstrap API, etc.).

## Commands

Run from the repo root; `turbo` scopes each task to the packages that need it and caches results.

```sh
pnpm install
pnpm dev                                    # apps/server + apps/client together
pnpm lint / typecheck / test / build         # across the whole workspace
pnpm verify                                  # lint + typecheck + test + build, in that order
```

Scope to one package with `--filter`:

```sh
pnpm --filter @castle-clash/shared test
pnpm --filter @castle-clash/server run typecheck
```

Run a single test file or pattern with Vitest directly (from the package directory, or via
`--filter ... exec`):

```sh
cd packages/shared && npx vitest run src/math/aabb.test.ts
cd packages/shared && npx vitest run -t "penetration"
```

**pnpm is pinned to 12.x and TypeScript to 6.0.x — don't bump either to "latest" without
checking first.** `typescript@latest` on npm is 7.0, a native compiler with no programmatic
compiler API until 7.1; `typescript-eslint` can't run against it yet (its own peer range is
`<6.1.0`). This is recorded in `docs/research/phase1-version-assumptions.md`, item 8.

If `corepack` isn't available (it isn't bundled with every Node 24 build — it wasn't on this
project's own dev machine), install pnpm directly: `npm install -g pnpm@12.4.1`.

### Containers

Container build files are named `containerfile` (not `Dockerfile`) and the ignore file
`containerfile.containerignore` (not `.containerignore`) — this project builds locally with
`podman`, not `docker`. Build context is the **repo root** for both apps (they run `turbo prune`
against the full workspace):

```sh
podman build --ignorefile=containerfile.containerignore -f apps/server/containerfile -t castle-clash-server .
podman build --ignorefile=containerfile.containerignore -f apps/client/containerfile -t castle-clash-client .
```

`--ignorefile` is required because podman only auto-discovers `.containerignore`/`.dockerignore`,
not the `containerfile.containerignore` name. A `.dockerignore` with identical content also exists
at the root (kept in sync by hand) because CI's `docker buildx` only auto-discovers `.dockerignore`
— there's no single ignore-file name both engines auto-discover. The `containerfile`s themselves
carry no BuildKit-only syntax, so the same file builds under either engine.

## Architecture

### The isomorphic boundary is enforced by tooling, not just convention

`packages/shared` holds gameplay rules (physics, combat, hazards, power-ups — once written) as
pure functions: no DOM, no Node APIs, no wall-clock reads. The server will run this code
authoritatively; the client runs the identical code for local prediction. This is ADR 0001's
decision (D1–D3 in the plan), and it's checked mechanically in two places:

- `packages/shared/tsconfig.json` sets `types: []`, so any reference to `window`, `document`, or
  `process` fails typecheck.
- The root `eslint.config.js` has a `no-restricted-imports` rule scoped to `packages/shared/**`
  blocking imports of `react`, `pixi.js`, `@supabase/*`, `@castle-clash/server`, and
  `@castle-clash/client`. A second rule, scoped to `apps/client/app/game/**` (a directory that
  doesn't exist yet — it's Phase 3's `GameClient` layer), blocks `react` imports the same way: Pixi
  runs imperatively there, and React never re-renders on the game loop.

When Colyseus/`@colyseus/schema` land in Phase 2+, the sim will run on plain objects (`SimState`),
separate from the `@colyseus/schema` network classes — a `projectToSchema()` step copies sim state
into schema once per tick, rather than gameplay code touching schema instances directly. See ADR
0001 for why.

### Workspace layout and package boundaries

```
apps/server/    # Colyseus authoritative server (Node, tsc build)
apps/client/    # React Router v8 SPA (ssr: false) + PixiJS, Vite build
packages/shared/ # isomorphic: config, types, input, math (sim/combat/arenas/schema come later)
```

`packages/shared` publishes two subpath exports, wired via `tsup` (`tsup.config.ts` lists both
entry points) and `package.json`'s `exports` map: `.` (the gameplay/types/math surface) and
`./testing` (currently an empty placeholder — `SimHarness`/`NetSim`/bots land in Phase 3, but the
export path exists now so consumers have a stable import from the start).

Each package's `tsconfig.json` extends the root `tsconfig.base.json` (strict,
`noUncheckedIndexedAccess`, `verbatimModuleSyntax`) and overrides only what differs — module
resolution (`bundler` for the client, `nodenext` for the server), `lib`/`types`, and the
`experimentalDecorators`/`useDefineForClassFields: false` pair that `@colyseus/schema`'s decorators
will need once schema classes exist. If you add a package or app, extend the base config rather
than hand-duplicating its flags — a client tsconfig that didn't do this was a real bug caught in
Phase 1's code review, because it let strictness silently drift out of sync with its siblings.

`apps/server` splits its build into two tsconfigs: `tsconfig.json` (used by `tsc --noEmit` for
typecheck, includes test files) and `tsconfig.build.json` (extends it, excludes `**/*.test.ts`) so
compiled test files don't ship in the production `dist/` or the container image.

### Turborepo tasks

`turbo.json` defines `build` (depends on `^build`, so `packages/shared` builds before the apps
that import it), `typecheck`/`test` (same `^build` dependency, since typechecking a consumer needs
its dependency's built `.d.ts`), `lint` (no dependency), and `dev` (persistent, uncached).

### Containerfiles

Both `apps/server/containerfile` and `apps/client/containerfile` follow the same multi-stage shape
(`base` → `pruner` runs `turbo prune <package> --docker` → `installer` runs
`pnpm install --frozen-lockfile` against the pruned `out/json` → `builder` overlays `out/full` and
runs `turbo build --filter=<package>`), then diverge at the end: the server does
`pnpm deploy --filter=... --prod /out` into a slim non-root `node:24-alpine` runtime stage; the
client's static `build/client` output gets copied into `nginx-unprivileged`, with `docker/nginx.conf`
(SPA fallback via `try_files`) and `docker/entrypoint.sh` (renders `config.js` from
`GAME_SERVER_URL`/`SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` env vars at container start, and
refuses to start if any are missing).

One easy-to-miss gotcha if you touch these: `turbo prune` only copies files owned by an in-scope
workspace package into `out/full` — a root-level file like `tsconfig.base.json`, which every
package's tsconfig `extends` by relative path, has to be `COPY`'d in explicitly in the `builder`
stage or `tsc` fails with `TS5083` inside the container even though the exact same build works
fine outside one.

pnpm/turbo are installed into the container via `npm install -g` rather than `corepack enable` —
`corepack` isn't reliably present across `node:24-alpine` builds (confirmed missing on this
project's own dev machine's Node 24).
