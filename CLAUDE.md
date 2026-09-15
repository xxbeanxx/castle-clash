# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A 2D Renaissance knight arena brawler: an authoritative Colyseus server, a React Router + PixiJS
client, and Supabase for auth/persistence, in a pnpm + Turborepo monorepo.

**`docs/IMPLEMENTATION_PLAN.md` is the source of truth** for architecture and the phase-by-phase
build order — read it before making structural changes. It's being implemented phase by phase;
check its "Phase N" sections against what actually exists in the tree to see how far the build has
gotten (as of this writing: Phase 2, Walking Skeleton, is done — a browser joins the `match` room
over a real WebSocket and every connected player syncs as `PlayerState` in `MatchState`; no sim,
combat, arenas, or auth exist yet, so `MatchRoom` only tracks join/leave and an incrementing tick).
`docs/adr/` records specific decisions (currently just ADR 0001, the isomorphic-sim boundary);
`docs/research/` records version/API facts verified against live docs mid-implementation — check it
before trusting a version number stated in the plan's prose, since several were wrong when written
(pnpm "10" vs the actual 12, Colyseus's server bootstrap API, etc.). `docs/research/phase2-colyseus-
client-compat.md` matters for anyone touching the client's Colyseus connection: the plan's
`colyseus.js` assumption is stale — the browser client dependency is `@colyseus/sdk`, not
`colyseus.js` (which tops out at 0.16.x with an incompatible `@colyseus/schema` v3 decoder against
this server's v5 schema).

## Commands

Run from the repo root; `turbo` scopes each task to the packages that need it and caches results.

```sh
pnpm install
pnpm dev                                    # apps/server + apps/client together
pnpm lint / typecheck / test / build         # across the whole workspace
pnpm format / format:check                   # oxfmt across the whole workspace (not wired into verify/CI yet)
pnpm verify                                  # lint + typecheck + test + build, in that order
```

Linting is `oxlint` (`oxlint.config.ts` at the repo root — a `.ts` config, not `.oxlintrc.json`;
each package's `lint` script is just `oxlint .`, and oxlint walks up from a package's own directory
to find the root config the same way ESLint's flat config did, so `pnpm --filter <pkg> run lint`
still gets the root rules). Formatting is `oxfmt` (`oxfmt.config.ts`, same `.ts`-config convention).
Both replaced ESLint/`typescript-eslint`/`eslint-plugin-react-hooks` and Prettier outright — see
`docs/research/toolchain-ts7-oxc-migration.md` for why, and for the isomorphic-boundary
`no-restricted-imports` rules' exact translation into oxlint's `overrides[].files`. **`oxfmt` is
self-described beta** (versioned `0.x`, no GA yet as of that research) — pinned to an exact version
in root `package.json`, not a caret range, for that reason.

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
checking first.** `typescript@latest` on npm is still 7.0.x, a native compiler with no
programmatic compiler API until a 7.1 release that (as of the last check) exists only as an
unstable dev prerelease, not on the `latest`/stable dist-tag. Switching to oxlint removed the
`typescript-eslint` peer-range blocker this was originally pinned against (recorded in
`docs/research/phase1-version-assumptions.md`, item 8), but a **second, independent blocker
remains**: `tsup@8.5.1` (used by `packages/shared` for its `.d.ts` bundle) crashes on TS 7.0.x in
its `dts` step — open upstream issue `egoist/tsup#1408`, unmerged fix. Don't bump `typescript`
until that's resolved upstream _and_ a stable 7.1+ ships; full detail and exactly what to watch for
in `docs/research/toolchain-ts7-oxc-migration.md` §1.

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

### Local stack (`compose.yaml`)

`compose.yaml` at the repo root runs `server` (port 2567) and `client` (port 8080,
`GAME_SERVER_URL=ws://localhost:2567` — the browser connects to this directly, so it has to be
host-reachable, not the compose network's internal `server` hostname). **Neither `podman-compose`
nor a `podman compose` subcommand is installed on this dev machine**, so the file has only ever
been validated by hand: build both images with the `podman build` commands above (they tag
`castle-clash-{server,client}:local`, which `compose.yaml`'s `image:` fields reference), then
`podman network create cc-net` and `podman run` each image on that network with the same ports/env
`compose.yaml` declares, and curl `/healthz` and `/`. CI's `docker.yml` `smoke` job runs the real
`docker compose up -d --wait` (Docker is preinstalled on GitHub-hosted runners), so that path does
get exercised for real on every PR — just not locally on this machine yet.

`healthcheck:` in `compose.yaml` uses `http://127.0.0.1:...`, not `localhost` — found by hand-running
the containers: this machine's Alpine images resolve `localhost` to `::1` first, and neither
nginx (see `apps/client/docker/nginx.conf`'s IPv6 setup failing silently against the read-only
config mount — `docker-entrypoint.d`'s `10-listen-on-ipv6-by-default.sh` logs "can not modify
...default.conf") nor the plain Node server actually accept IPv6 connections in this image, so a
`localhost`-based `wget --spider` inside either container gets "Connection refused" even though the
service is up and the exact same URL is reachable from the host.

A headless join smoke test lives at `apps/server/scripts/smoke-join.ts` (`pnpm --filter server run
smoke-join`, reads `GAME_SERVER_URL` from the env): it connects with `@colyseus/sdk`, joins `match`,
and asserts state arrives with the expected player count. CI's `docker.yml` `smoke` job runs this
against the compose stack before the `push` job (gated on `smoke`) publishes to GHCR.

## Architecture

### The isomorphic boundary is enforced by tooling, not just convention

`packages/shared` holds gameplay rules (physics, combat, hazards, power-ups — once written) as
pure functions: no DOM, no Node APIs, no wall-clock reads. The server will run this code
authoritatively; the client runs the identical code for local prediction. This is ADR 0001's
decision (D1–D3 in the plan), and it's checked mechanically in two places:

- `packages/shared/tsconfig.json` sets `types: []`, so any reference to `window`, `document`, or
  `process` fails typecheck.
- The root `oxlint.config.ts` has a `no-restricted-imports` override scoped (via `overrides[].files`)
  to `packages/shared/**` blocking imports of `react`, `pixi.js`, `@supabase/*`,
  `@castle-clash/server`, and `@castle-clash/client`. A second override, scoped to
  `apps/client/app/game/**` (the `GameClient` layer, landed in Phase 2), blocks `react` imports the
  same way: Pixi runs imperatively there, and React never re-renders on the game loop.

When Colyseus/`@colyseus/schema` land in Phase 2+, the sim will run on plain objects (`SimState`),
separate from the `@colyseus/schema` network classes — a `projectToSchema()` step copies sim state
into schema once per tick, rather than gameplay code touching schema instances directly. See ADR
0001 for why.

### The walking skeleton (Phase 2)

`packages/shared/src/schema/state.ts` has `PlayerState`/`MatchState` (`@colyseus/schema` v5, legacy
decorator API — same classes run in both `apps/server` and `apps/client`, since schema is
isomorphic-safe: no DOM/Node APIs). `apps/server/src/rooms/MatchRoom.ts` is the thin room described
in D2: `onJoin`/`onLeave` add/remove a `PlayerState`, and an injected `TickDriver`
(`apps/server/src/rooms/TickDriver.ts`) increments `state.tick` — `IntervalTickDriver` wraps the
room's `setTimestep` in prod (not `setSimulationInterval`, which the plan's prose names but which
`@colyseus/core@0.18.13` marks deprecated in favor of `setTimestep`; same behavior), and
`ManualTickDriver.step(n)` drives it synchronously in tests, ahead of Phase 3 actually needing a
real per-tick sim. `apps/client/app/game/GameClient.ts` (no React below `app/game/**`, enforced by
ESLint) owns the Pixi `Application` and the room connection; `game/viewmodel/playersToRects.ts` is
the pure `MatchState -> {id,x,y,tint}[]` mapping Pixi code draws from, and
`game/render/PlayerRects.ts` syncs one tinted `Sprite` per player against a real `Container` —
tested against a real Pixi `Application` in Vitest browser mode (`@vitest/browser-playwright` +
a locally-installed Chromium; see `apps/client/vitest.browser.config.ts` and the `test:browser`
script), since jsdom can't drive Pixi's canvas/WebGL renderer.

**The client's Colyseus SDK is `@colyseus/sdk`, not `colyseus.js`** — the plan's Phase 2 prose
assumes the latter, but `colyseus.js` has no 0.17/0.18 release anywhere (npm, GitHub branches, or
tags) and bundles an incompatible `@colyseus/schema` v3 decoder against this server's v5 schema.
`@colyseus/sdk` version-tracks the `colyseus` server package and is the pairing
`docs.colyseus.io` documents today. See `docs/research/phase2-colyseus-client-compat.md` for the
full check (wire-format evidence, migration-guide citation, etc.) before changing either dependency.

`express@5.2.1` ships no types of its own — `apps/server` has `@types/express` as a real
devDependency, not an assumption to skip. Colyseus's own `express?:` server-config callback types
its `app` parameter as the narrower `express.Application`, not `@types/express`'s `Express` (the
`express()` factory's return type); a function meant to be passed there, like
`apps/server/src/http.ts`'s `registerHealthRoutes`, has to type its own parameter as `Application`
or TS rejects the assignment.

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

Both have been built and run for real with `podman` (not just typechecked/dry-run), including
hitting `/config.js`, `/`, and an arbitrary SPA route on the running client container. Gotchas
found that way, in case you touch these files:

- `turbo prune` only copies files owned by an in-scope workspace package into `out/full` — a
  root-level file like `tsconfig.base.json`, which every package's tsconfig `extends` by relative
  path, has to be `COPY`'d in explicitly in the `builder` stage (both containerfiles do this) or
  `tsc`/tsup's dts step fails with `TS5083` inside the container even though the exact same build
  works fine outside one.
- Base images are fully-qualified (`docker.io/library/node:...`, `docker.io/nginxinc/...`), not
  short names. This machine's podman has `short-name-mode = "enforcing"` in
  `/etc/containers/registries.conf`; a short name with no cached alias fails the build with
  "short-name resolution enforced but cannot prompt without a TTY" the first time it's pulled.
  Fully-qualifying sidesteps the local registries.conf entirely.
- The client's `USER root` / `RUN chown nginx:nginx /usr/share/nginx/html` / `USER 101` bracket
  around the final `COPY`s is required, not decorative: `nginx-unprivileged` runs as `USER 101`
  and `COPY --chown=nginx:nginx` only chowns the newly-copied _files_, not the pre-existing
  `/usr/share/nginx/html` _directory_ itself (still root-owned, not group-writable) — without the
  explicit `chown` of the directory, the `entrypoint.sh`/`docker-entrypoint.d` script that renders
  `config.js` into it at container start fails with `Permission denied`.

pnpm/turbo are installed into the container via `npm install -g` rather than `corepack enable` —
`corepack` isn't reliably present across `node:24-alpine` builds (confirmed missing on this
project's own dev machine's Node 24).
