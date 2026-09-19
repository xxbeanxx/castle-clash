# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A 2D Renaissance knight arena brawler: an authoritative Colyseus server, a React Router + PixiJS
client, and Supabase for auth/persistence, in a pnpm + Turborepo monorepo.

**`docs/IMPLEMENTATION_PLAN.md` is the source of truth** for architecture and Phases 1–10, all landed:
deterministic sim and netcode, combat, six arenas with hazards, quick-play/private-room matchmaking,
power-up draft, Supabase auth and persistence (guest sign-in, OAuth buttons, loadouts, stats,
leaderboard), and a production deploy (live since 2026-09-19, currently `v1.1.0`). **What comes
next is `docs/IMPLEMENTATION_PLAN_V2.md`, Phases 11–17** (landing page and UI kit, Google login,
mobile controls, bots, pixel art, audio, hardening); its section 0 lists verified findings about
today's tree, and its Appendix A lists decisions still open. Everything a _player_ sees is still
placeholder: knights are tinted rects, there is no art, audio, or touch input, and a lone visitor
cannot start a match (`MIN_PLAYERS = 2`, no bots). `docs/adr/` records specific decisions;
`docs/research/` records version/API facts verified against live docs and every scope deviation
from a plan — check it before trusting a version number stated in a plan's prose, since several
were wrong when written (pnpm "10" vs the actual 12, Colyseus's server bootstrap API, etc.).
`docs/research/phase2-colyseus-client-compat.md` matters for anyone touching
the client's Colyseus connection: the plan's `colyseus.js` assumption is stale — the browser client
dependency is `@colyseus/sdk`, not `colyseus.js` (which tops out at 0.16.x with an incompatible
`@colyseus/schema` v3 decoder against this server's v5 schema). `docs/research/phase3-colyseus-
input-prediction-api.md` covers the input/prediction API facts checked before Phase 3's netcode was
built.

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

Container build files are named `containerfile` (not `Dockerfile`) and the ignore files
`containerfile.containerignore` (not `.containerignore`) live alongside them in `apps/server/` and
`apps/client/` — this project builds locally with `podman`, not `docker`. Build context is the
**repo root** for both apps (they run `turbo prune` against the full workspace):

```sh
podman build -f apps/server/containerfile -t castle-clash-server:local .
podman build -f apps/client/containerfile -t castle-clash-client:local .
```

When using podman, `containerfile.containerignore` in each folder is automatically used, so no
special flags are required.

### Local stack (`compose.yaml`)

`compose.yaml` at the repo root runs `server` (port 2567) and `client` (port 8080,
`GAME_SERVER_URL=ws://localhost:2567` — the browser connects to this directly, so it has to be
host-reachable, not the compose network's internal `server` hostname). **Neither `podman-compose`
nor a `podman compose` subcommand is installed on this dev machine**, so the file has only ever
been validated by hand: build both images with the `podman build` commands above (they tag
`castle-clash-{server,client}:local`, which `compose.yaml`'s `image:` fields reference), then
`podman network create cc-net` and `podman run` each image on that network with the same ports/env
`compose.yaml` declares, and curl `/healthz` and `/`. CI's `containers.yaml` `smoke` job runs
`podman compose up -d --wait`, exercising the stack in GitHub Actions.

`healthcheck:` in `compose.yaml` uses `http://127.0.0.1:...`, not `localhost` — found by hand-running
the containers: this machine's Alpine images resolve `localhost` to `::1` first, and neither
nginx (see `apps/client/docker/nginx.conf`'s IPv6 setup failing silently against the read-only
config mount — `docker-entrypoint.d`'s `10-listen-on-ipv6-by-default.sh` logs "can not modify
...default.conf") nor the plain Node server actually accept IPv6 connections in this image, so a
`localhost`-based `wget --spider` inside either container gets "Connection refused" even though the
service is up and the exact same URL is reachable from the host.

A headless join smoke test lives at `apps/server/scripts/smoke-join.ts` (`pnpm --filter server run
smoke-join`, reads `GAME_SERVER_URL` from the env): it connects with `@colyseus/sdk`, joins `match`,
and asserts state arrives with the expected player count. CI's `containers.yaml` `smoke` job runs this
against the compose stack before the `push` job (gated on `smoke`) publishes to GHCR. `smoke-join`
runs via `tsx` against checked-out source, not the built container images, but it still imports
`@castle-clash/shared`, which resolves through the workspace symlink to `packages/shared/dist` — a
directory `pnpm install` doesn't produce and that only exists locally because `turbo` builds it as
a dependency of other tasks. The `smoke` job runs `pnpm --filter @castle-clash/shared run build`
right before `smoke-join` for exactly this reason; a fresh runner that skips straight from
`pnpm install` to `smoke-join` fails with `ERR_MODULE_NOT_FOUND`.

### Selective CI (`dorny/paths-filter`)

On a **pull request**, `ci.yaml` and `containers.yaml` skip jobs the PR can't affect (a docs- or
infra-only PR skips `verify`, `browser`, `build`, `smoke`); every other trigger — push to `main`,
dispatch — runs everything. The globs live in `.github/paths-filter.yaml` (`code`, `browser`,
`images`), evaluated by the reusable `.github/workflows/changes.yaml`. If you add a top-level file or
directory a build reads, add it to the filter — a missing glob is a *skipped required check that
should have run*. `e2e.yaml`/`integration.yaml` keep their own workflow-level `paths:` (they aren't
required checks; a whole-workflow skip costs no runner, where a `changes` job would).

The `main` ruleset requires `verify`, `browser`, `build (server)`, `build (client)`, `smoke`. A
skipped plain job counts as passing, but a **matrix job skipped with a job-level `if` never expands
its matrix, so `build (server)`/`build (client)` would never report** and the PR would hang on
"Expected". That's why `build` always runs and gates its *steps* on `IMAGES_CHANGED` instead. Keep
any required matrix job that way.

### Releases and deployment (Azure Container Apps)

`docs/hosting.md` is the runbook; `docs/research/phase10-deploy-decisions.md` records the decisions,
the facts checked, and what is still unproven. In short: `release.yaml` (release-please) → `docker.yaml`
(multi-arch, provenance/SBOM, Trivy gate, then release tags) → `deploy.yaml` → `deploy-environment.yaml`
for `staging`, then `production` behind a required reviewer, deploying by image digest and finishing
with `pnpm --filter @castle-clash/server run deploy-smoke`. `infra/terraform/` manages the Azure
resources, the `atomic-nucleus.com` DNS records, the Supabase project, and the GitHub repo (a
`main` ruleset requires a PR plus the `verify`/`browser`/`build`/`smoke` checks, squash-only) and its
`production` environment. It also generates every secret and wires each to its consumers, so nothing
is set by hand; state is in an Azure storage account and is sensitive (its README says what Terraform
leaves to the deploy workflow). **Production was first deployed 2026-09-19** (`v1.0.0`; server and client live, game verified in a real browser under the CSP) after several first-run fixes — see the "First production deploy" section of `docs/research/phase10-deploy-decisions.md`. Lessons that bite: re-running a failed run replays the _old_ workflow commit (dispatch a new run instead); environment secrets need `secrets: inherit` in a reusable-workflow chain; Turborepo strict env mode drops `VITE_E2E` unless `turbo.json` declares it; PixiJS needs `pixi.js/unsafe-eval` under the client's CSP. `SERVER_VERSION` is stamped into the server image by build-arg and shows up in
`/healthz` and `matches.server_version`. `POST /smoke/record-match` exists only when the server has a
`SMOKE_TOKEN`; `record_match_result()` skips `player_stats` for `mode = 'smoke'`. Migrations follow
expand/contract because rollbacks never revert the database.

## Architecture

### The isomorphic boundary is enforced by tooling, not just convention

`packages/shared` holds gameplay rules (physics, movement, combat, hazards, and power-ups) as pure functions: no DOM, no Node APIs, no wall-clock reads. The server runs this code
authoritatively; the client runs the identical code for local prediction. This is ADR 0001's
decision (D1–D3 in the plan), and it's checked mechanically in two places:

- `packages/shared/tsconfig.json` sets `types: []`, so any reference to `window`, `document`, or
  `process` fails typecheck.
- The root `oxlint.config.ts` has a `no-restricted-imports` override scoped (via `overrides[].files`)
  to `packages/shared/**` blocking imports of `react`, `pixi.js`, `@supabase/*`,
  `@castle-clash/server`, and `@castle-clash/client`. A second override, scoped to
  `apps/client/app/game/**` (the `GameClient` layer, landed in Phase 2), blocks `react` imports the
  same way: Pixi runs imperatively there, and React never re-renders on the game loop.

Since Phase 3, the sim runs on plain objects (`packages/shared/src/sim/types.ts`'s `SimState`),
separate from the `@colyseus/schema` network classes — `MatchRoom`'s tick calls
`packages/shared/src/schema/project.ts`'s `projectToSchema()` once per tick to copy sim state into
schema, rather than gameplay code touching schema instances directly. See ADR 0001 for why.

### The walking skeleton (Phase 2)

`packages/shared/src/schema/state.ts` has `PlayerState`/`MatchState` (`@colyseus/schema` v5, legacy
decorator API — same classes run in both `apps/server` and `apps/client`, since schema is
isomorphic-safe: no DOM/Node APIs). `apps/server/src/rooms/MatchRoom.ts` is the thin room described
in D2: `onJoin`/`onLeave` add/remove a `PlayerState`, and an injected `TickDriver`
(`apps/server/src/rooms/TickDriver.ts`) drives the tick — `IntervalTickDriver` wraps the room's
`setFixedTimestep` in prod (not `setSimulationInterval`, which the plan's prose names, nor
`setTimestep`, which Phase 2's first pass used; both hand a _measured_, jittery wall-clock delta,
which `GameSimulation.step()`'s determinism can't tolerate — `setFixedTimestep` hands a
framework-owned, always-`1/tickRate` `dt` instead, per `docs/research/phase3-colyseus-input-
prediction-api.md`), and `ManualTickDriver.step(n)` drives it synchronously in tests — built ahead
of Phase 3's real per-tick sim need, and now also what `MatchRoom.movement.test.ts`'s
scripted-input tests drive. `apps/client/app/game/GameClient.ts` (no React below `app/game/**`,
enforced by oxlint) owns the Pixi `Application` and the room connection; `game/viewmodel/
playersToRects.ts` is the pure `MatchState -> {id,x,y,tint}[]` mapping Pixi code draws from, and
`game/render/PlayerRects.ts` syncs one tinted `Sprite` per player against a real `Container` —
tested against a real Pixi `Application` in Vitest browser mode (`@vitest/browser-playwright` + a
locally-installed Chromium; see `apps/client/vitest.browser.config.ts` and the `test:browser`
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

### Deterministic movement and netcode (Phase 3)

`packages/shared/src/sim/` is the authoritative gameplay core, all pure functions over plain
objects: `physics.ts` (gravity, axis-separated AABB sweep, one-way platforms, terminal velocity),
`movement.ts` (acceleration/friction, coyote time, jump buffering, variable jump height,
drop-through), and `GameSimulation.step(state, inputs)`, which both `MatchRoom` and the client's
`Reconciler` call — the server for real ticks, the client to predict and to replay pending inputs
after a reconciliation. `packages/shared/src/arenas/testbed.ts` is the Phase 3 placeholder arena
(`TESTBED_ARENA`); Phase 6 added the six real arenas beside it. `packages/shared/src/testing/` (`SimHarness`
for scripted N-tick runs, `NetSim` for an in-memory latency/jitter/loss-configurable network,
`bots/scripted.ts`) exists for exactly the determinism and convergence tests the plan's Phase 3
gate names, in `packages/shared/src/sim/determinism.test.ts` and `testing/NetSim.test.ts`.

The prediction/interpolation logic itself is split across the isomorphic boundary the same way sim
is: `packages/shared/src/net/{Reconciler,Interpolator}.ts` hold the framework-free core (predict,
replay pending inputs on reconcile, snapshot-buffer interpolation at `serverTime − 100 ms`), and
`apps/client/app/game/net/{Reconciler,Interpolator}.ts` are thin adapters — the only client-specific
piece is decoding a `@colyseus/schema` `PlayerState` into the plain `SimPlayer` the shared core
replays from (`schemaToSimPlayer`). Server-side, `apps/server/src/rooms/InputQueue.ts` is a
per-player ring buffer (rejects stale `seq`, caps depth at 8, repeats the last frame for up to 6
ticks before going neutral), and `MatchRoom`'s tick is `drain inputs → GameSimulation.step →
projectToSchema → record lastProcessedSeq`, at `setPatchRate(1000 / PATCH_RATE)`. Client-side,
`apps/client/app/game/input/KeyboardInput.ts` samples key state into a bitmask on the fixed-step
accumulator (not per render frame), and `GameClient.ts` runs a fixed 60 Hz sim loop with rendering
interpolated between steps by `alpha`.

`GameClient`'s lifecycle is a typed `Phase` union (`idle → starting → connected → predicting`, plus
`destroyed`), not independent optional fields — that refactor (`8607e33`) followed two real bugs
found only by loading the game in an actual browser, not from the (all-green) test suite, which
mocks `GameClient` wholesale or hands it state that already has the local player in it:

1. React StrictMode double-invokes the mount effect in dev, so `destroy()` can race `start()`'s own
   in-flight `await`s; every post-`await` continuation in `start()` has to check the phase (via a
   `#getPhase()` method, not a direct field read — tsc's control-flow narrowing doesn't know
   `destroy()` can mutate `#phase` during an `await`, and flags a direct comparison as an impossible
   literal) and tear down cleanly if a `destroy()` already ran.
2. `room.state.players.get(room.sessionId)` right after `joinOrCreate()` can be `undefined` —
   `joinOrCreate()` can resolve before the first full-state patch decodes — so the `Reconciler` is
   seeded lazily from whichever `onStateChange` patch first carries the local player's schema entry,
   not just once right after join.

`ci.yaml` turns on Vitest coverage for `packages/shared` (`sim/**` ≥ 90% lines) and sets `FC_SEED`
from `github.run_id` on both the main verify step and the coverage step, so a `fast-check`
property-test failure in CI reproduces locally with the exact same seed.

**The hand-rolled `InputQueue`/`Reconciler`/`Interpolator` is a deliberate choice, not an
oversight** — `@colyseus/core`'s `Room.defineInput()` and `@colyseus/sdk`'s `room.input()` +
`predict.reconciler()`/`predict.sim()` already ship a complete, more capable input-buffering and
client-prediction/rollback framework (evaluated in full in
`docs/research/phase3-colyseus-input-prediction-api.md` §2). It wasn't adopted for Phase 3 because
it's a negotiated wire protocol coupling both ends — a client can't send raw `room.send("input", …)`
into a server `defineInput()` buffer, so adopting it is an all-or-nothing swap of the whole netcode
stack, not an incremental one — and because verifying it meets the plan's exact thresholds (buffer
depth 8, 6-tick repeat-then-neutral, 4 px smoothing cutoff, 100 ms remote lag) means reading several
more undocumented `.d.ts` modules than fit in this phase. Don't "simplify" the hand-rolled version
onto the built-in one without redoing that evaluation; it's a real, deliberately-deferred option
for a later phase, not an obviously-superseded first attempt.

### The front door (Phase 11)

`apps/client` styles through CSS custom properties, never inline `style` (only data-driven values:
a bar's width, a swatch's colour). `app/styles/tokens.css` is the whole theme; `app/ui/kit/` holds
the primitives (`Button`, `ButtonLink`, `Panel`, `Field`/`Input`/`Select`, `Modal`, `Nav`) — reach
for them before writing markup. Fonts are OFL files vendored in `public/fonts/` (the CSP has no
`font-src`); never point at Google Fonts.

`routes.ts` puts every page except `/play/:roomId` under `layouts/SiteLayout.tsx` (header, footer,
skip link). Each route exports `meta` through `app/meta.ts` (`pageMeta` for public pages,
`privatePageMeta` = `noindex` for guarded ones); a route's `meta` replaces its parent's wholesale.
`/`, `/how-to-play`, `/privacy`, `/terms`, `/about` are **prerendered** (`react-router.config.ts`).
That changes what nginx must do, and `docker/nginx.conf` encodes it: unknown routes fall back to
`__spa-fallback.html` (never `index.html`, which is now the landing page), and prerendered pages are
found as `$uri/index.html` (a bare `$uri/` makes nginx redirect using its own port, 8080). Anything
you add to the prerender list needs a matching entry in `public/sitemap.xml` if it is public.
`docs/research/phase11-prerender-and-metadata.md` has the evidence.

Auth: `/`, `/leaderboard` and the static pages are public; `lobby`, `play`, `loadout`, `stats` call
`requireSession(request)`, which redirects to `/login?next=<path+query>`; `login` honours `next` only
through `auth/nextPath.ts`'s `safeNextPath` (same-origin paths only). OAuth still returns to plain
`/login`, so `next` is lost across a Google round trip until Phase 12 carries it in `redirectTo`.
The leaderboard query excludes players without a display name (v2 decision D3, no migration).
`auth/supabase.js` is imported dynamically by anything on the landing page's path (`useSession`,
`PlayNowButton`, `LeaderboardTeaser`, the header's sign-out) to keep `supabase-js` out of its
critical path; keep it that way.

The server's `GET /stats` (`publicStats.ts`) feeds the landing page's "players online" line and the
footer's version, and is checked by the deploy smoke. Every consumer treats failure as "show
nothing". `pnpm --filter @castle-clash/client run check:landing` fails if Pixi or `supabase-js`
enter `/`'s script graph; CI's `web-quality` job also holds Lighthouse to performance >= 90,
accessibility >= 95, LCP <= 2.5 s.

Gotchas from checking this live rather than trusting tests:

- `<script src="/config.js">` must stay a plain synchronous script. React Router emits its own
  module script as `async`, so `defer` on `config.js` races it.
- nginx ships with gzip off; without `gzip on` the JS bundle is ~4x larger and the landing page's
  LCP misses its budget on a throttled phone.
- Serving `build/client` from a podman bind mount: a rebuild replaces the directory, so restart the
  container afterwards or it 500s. Run `docker/entrypoint.sh` (with `HTML_DIR`/`CSP_CONF`) to
  generate `config.js` and the real CSP. `VITE_E2E=1` is needed at build time for the e2e specs'
  `window.__CC_DEBUG__`.
- `pnpm dev` is React StrictMode, which double-mounts `GameClient.start()`; quick play from a cold
  page can fail there with "user is already connected to this match". The production build doesn't
  do it, so run Playwright against a built client, not the dev server.
- Quick play joins one shared public room, so an e2e spec must not assume it is fresh: assert the
  local player's HUD (`combat-hud`), not the match banner.

### Workspace layout and package boundaries

```
apps/server/    # Colyseus authoritative server (Node, tsc build)
apps/client/    # React Router v8 SPA (ssr: false) + PixiJS, Vite build
packages/shared/ # isomorphic: config, types, input, math, sim, arenas, hazards, combat, powerups, match, net, schema
```

`packages/shared` publishes two subpath exports, wired via `tsup` (`tsup.config.ts` lists both
entry points) and `package.json`'s `exports` map: `.` (the gameplay/types/math surface) and
`./testing` (`SimHarness`, `NetSim`, and `testing/bots/scripted.ts`, filled in during Phase 3 — the
export path existed as an empty placeholder since Phase 1 so consumers had a stable import from the
start).

Each package's `tsconfig.json` extends the root `tsconfig.base.json` (strict,
`noUncheckedIndexedAccess`, `verbatimModuleSyntax`) and overrides only what differs — module
resolution (`bundler` for the client, `nodenext` for the server), `lib`/`types`, and the
`experimentalDecorators`/`useDefineForClassFields: false` pair `@colyseus/schema`'s decorators need
(`packages/shared/src/schema/state.ts`'s `PlayerState`/`MatchState`, legacy decorator API). If you
add a package or app, extend the base config rather than hand-duplicating its flags — a client
tsconfig that didn't do this was a real bug caught in Phase 1's code review, because it let
strictness silently drift out of sync with its siblings.

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
