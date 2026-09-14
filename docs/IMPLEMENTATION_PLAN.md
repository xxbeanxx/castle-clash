# Castle Clash — Implementation Plan

A 2D Renaissance knight arena brawler. TypeScript monorepo with an authoritative Colyseus server, a React Router + PixiJS client, and Supabase for auth and persistence. Container images are published to GHCR by GitHub Actions.

---

## 0. Architecture at a Glance

### 0.1 Guiding decisions

| #   | Decision                                                                                                                                                                                                                       | Rationale                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Gameplay rules live in `shared` as pure, deterministic functions.** Physics, the combat state machine, hazards, and power-up modifiers do no I/O and use no DOM, Node, or wall-clock APIs.                                   | The server runs them authoritatively and the client runs the same code for prediction, so most tests need no network, canvas, or database.        |
| D2  | **Colyseus rooms stay thin.** `MatchRoom` converts network messages into `GameSimulation` calls and projects the result into Schema. It holds no gameplay rules.                                                               | Room tests only need to cover wiring, auth, and phase transitions.                                                                                |
| D3  | **The sim model is separate from the network schema.** The sim runs on plain objects (`SimState`). `projectToSchema()` copies them into `@colyseus/schema` classes once per tick.                                              | Plain objects are cheap to clone for prediction and replay, and easy to hash in determinism tests. With ≤ 8 players the copy cost doesn't matter. |
| D4  | **React owns the app shell; Pixi runs imperatively.** React Router handles routes (auth, lobby, loadout, stats). A single `<GameCanvas>` mounts a vanilla `GameClient` (Pixi `Application`, room connection, prediction loop). | The game loop never causes React re-renders. The HUD reads a throttled external store through `useSyncExternalStore`.                             |
| D5  | **Only the server writes competitive data.** The client can write only its own loadout, and RLS enforces that. The server records match results with the Supabase secret key through a single transactional SQL function.      | Players can't forge stats, and the secret key never reaches the client.                                                                           |
| D6  | **Each deployable ships as one immutable image, promoted by digest.** `castle-clash-server` (Node) and `castle-clash-client` (static files served by nginx, with config injected at runtime).                                  | The same image runs in CI smoke tests, staging, and production.                                                                                   |
| D7  | **Fixed timestep.** The sim ticks at 60 Hz, and state patches go out at 20 Hz (configurable). Frame data is counted in ticks.                                                                                                  | Fighting-game frame data maps directly to ticks, and patch bandwidth stays bounded.                                                               |

**Version notes:** Target Node 24 LTS, pnpm 12, and **TypeScript 6.0.x** (not the `latest` 7.0 tag — see below), with versions pinned through `packageManager` and `.nvmrc`. Use Colyseus 0.18+ with `@colyseus/schema` v5, PixiJS v8, and React Router v8 in SPA mode (`ssr: false`; PixiJS is client-only). Check API names against the pinned versions' docs when you implement each phase. Versions confirmed 2026-09-14; see `docs/research/phase1-version-assumptions.md` for sources and detail.

**Corrections from version research (see `docs/research/phase1-version-assumptions.md`):**

- **Colyseus server bootstrap:** use `defineServer({ rooms, transport, express })` / `defineRoom(MatchRoom).filterBy([...])` from the `colyseus` package, not the older `new Server()`/`gameServer.define(...).filterBy(...)` (`@colyseus/tools` `config()`) shape — that's soft-deprecated as of 0.17.
- **`onAuth` signature:** static `onAuth(token, options, context)`, where the client's auth token is `context.token` (not a positional `token`/`req` pair).
- **`@colyseus/schema` decorators:** unchanged — `experimentalDecorators: true` and `useDefineForClassFields: false` are still required for the legacy `@type()` decorator API in v5. (v5 also adds an optional decorator-free `schema()`/`t.*` builder needing no special tsconfig; the plan uses the decorator API throughout, so no config change is needed unless that changes.)
- **`pnpm deploy`:** under pnpm 12.2+, `injectWorkspacePackages`/`--legacy` are no longer required for `pnpm deploy --filter ... --prod` against workspace-linked packages. (They would be required under pnpm 10/11.)
- **Vitest workspace config:** use a `projects: [...]` array inside a root `vitest.config.ts` instead of a separate `vitest.workspace.ts` file, which is deprecated since Vitest 3.2.
- **Vitest browser mode:** install `@vitest/browser-playwright` as a dev dependency and set `test.browser.provider: playwright()` (imported from that package) in the client's `vitest.config.ts` — the Playwright provider is no longer bundled with `vitest`/`@vitest/browser`.
- **TypeScript version — pin to 6.x, not the `latest` 7.0 tag:** `typescript@latest` (npm) is now 7.0.2, the Go-native ("Corsa"/`tsgo`) compiler. It type-checks and emits identically to 6.0, and still supports `experimentalDecorators`/`emitDecoratorMetadata`, `bundler`/`nodenext` module resolution, and `verbatimModuleSyntax`. But 7.0 ships **no programmatic compiler API** (`ts.createProgram`, `ts.transform`, etc.) until 7.1, which is expected around October 2026 — and `typescript-eslint` (needed for Phase 1 lint config) depends on that API and pins its own peer range to `typescript: ">=4.8.4 <6.1.0"`, i.e. it doesn't support 7.x at all yet. Pin the workspace to `typescript@6.0.3` (the current latest 6.x) everywhere; revisit once `typescript-eslint` and `tsup`'s `.d.ts` bundling confirm 7.1 support.
- **Containers: `podman` + `containerfile` naming, not `Dockerfile`.** Every phase that adds or touches a container build file should name it `containerfile` (lowercase, at the same paths the plan otherwise calls "`Dockerfile`"), and the ignore file `containerfile.containerignore` at the repo root — the user builds locally with `podman build --ignorefile=containerfile.containerignore -f apps/<app>/containerfile ...`. CI keeps using `docker buildx` (via `docker/build-push-action`) since GitHub-hosted runners have Docker preinstalled and the containerfiles carry no BuildKit-only syntax, so the same file builds under either engine; docker buildx only auto-discovers `.dockerignore`, so a `.dockerignore` with content identical to `containerfile.containerignore` also lives at the repo root — keep both in sync by hand, since there's no single name both engines auto-discover.

### 0.2 Repository layout (target end state)

```
castle-clash/
├─ apps/
│  ├─ client/                      # React Router v8 (SPA) + PixiJS
│  │  ├─ app/
│  │  │  ├─ routes/                # _index, login, lobby, play.$roomId, loadout, stats
│  │  │  ├─ ui/                    # React components (HUD, menus, draft picker)
│  │  │  ├─ game/                  # NO React imports below here
│  │  │  │  ├─ GameClient.ts       # owns Pixi app + room + loop
│  │  │  │  ├─ net/                # connection, InputSender, Reconciler, Interpolator
│  │  │  │  ├─ render/             # KnightView, ArenaView, HazardView, Camera, Fx
│  │  │  │  ├─ viewmodel/          # pure state → render props mapping (unit-tested)
│  │  │  │  └─ input/              # keyboard/gamepad → InputFrame
│  │  │  ├─ auth/                  # supabase client adapter (mockable seam)
│  │  │  └─ config/runtime.ts      # reads window.__CONFIG__
│  │  ├─ public/assets/            # spritesheets, audio, manifest.json
│  │  ├─ e2e/                      # Playwright specs
│  │  ├─ docker/nginx.conf, docker/entrypoint.sh
│  │  └─ containerfile
│  └─ server/                      # Colyseus authoritative server
│     ├─ src/
│     │  ├─ index.ts               # bootstrap, /healthz, /readyz, /metrics
│     │  ├─ rooms/MatchRoom.ts     # thin adapter (D2)
│     │  ├─ rooms/InputQueue.ts
│     │  ├─ match/                 # MatchDirector (phases), DraftService
│     │  ├─ auth/verifyToken.ts    # JWKS verification
│     │  ├─ persistence/           # PlayerRepository interface, Supabase + InMemory impls
│     │  └─ observability/         # pino logger, prom metrics
│     ├─ test/                     # @colyseus/testing integration specs
│     └─ containerfile
├─ packages/
│  └─ shared/                      # isomorphic: no DOM, no Node
│     └─ src/
│        ├─ config/                # tick rates, match rules, stamina/hp constants
│        ├─ types/                 # ids, enums, InputFrame, events
│        ├─ input/                 # bitmask encode/decode
│        ├─ math/                  # vec, aabb, seeded rng, state hash
│        ├─ sim/                   # physics, movement, GameSimulation.step()
│        ├─ combat/                # fsm, weapons (frame data), hitboxes, resolve
│        ├─ arenas/                # 6 ArenaDefinitions + validator
│        ├─ hazards/               # fire, breakable floor, kill zone, timed trap
│        ├─ powerups/              # definitions, computeStats, offer generation
│        ├─ match/                 # match phase FSM (pure)
│        ├─ cosmetics/             # catalog, unlock rules
│        ├─ schema/                # @colyseus/schema classes (network contract)
│        ├─ protocol/              # message names + payload validators
│        ├─ db/database.types.ts   # generated from Supabase
│        └─ testing/               # sim harness, network-condition simulator, bots
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/
│  └─ tests/                       # pgTAP (RLS + functions)
├─ .github/workflows/              # ci.yml, docker.yml, integration.yml, e2e.yml, deploy.yml
├─ docker-compose.yml              # local stack: server + client (+ supabase via CLI)
├─ turbo.json, pnpm-workspace.yaml, tsconfig.base.json, vitest.config.ts (root, `projects` array)
└─ docs/ (this plan, ADRs)
```

### 0.3 Runtime data flow

```mermaid
sequenceDiagram
  participant K as Keyboard
  participant C as Client (GameClient)
  participant S as Server (MatchRoom)
  participant Sim as shared/GameSimulation
  participant DB as Supabase

  C->>DB: sign in (supabase-js) → access token
  C->>S: joinOrCreate("match", {token})
  S->>S: onAuth: verify JWT via JWKS
  S->>DB: load loadout (secret key)
  loop every client tick (60 Hz)
    K->>C: key state
    C->>C: InputFrame{seq, bits} → predict with shared sim
    C->>S: "input" message
  end
  loop every server tick (60 Hz)
    S->>Sim: step(state, queuedInputs)
    Sim-->>S: new SimState + events
    S->>S: projectToSchema(); broadcast("fx", events)
  end
  S-->>C: schema patch (20 Hz) incl. lastProcessedSeq
  C->>C: Reconciler: rewind self to server state, replay unacked inputs
  C->>C: Interpolator: render remote players ~100 ms behind
  S->>DB: rpc record_match_result(payload) at match end
```

### 0.4 Test pyramid and boundaries

| Layer               | Tool                                      | Location                                        | What it covers                                                  | CI job           |
| ------------------- | ----------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- | ---------------- |
| Pure unit           | Vitest (+ fast-check)                     | `packages/shared/**/*.test.ts`                  | Physics, FSM, hit resolution, power-ups, arenas, RNG            | `ci / verify`    |
| Server unit         | Vitest                                    | `apps/server/src/**/*.test.ts`                  | InputQueue, MatchDirector, token verification, repository fakes | `ci / verify`    |
| Room integration    | Vitest + `@colyseus/testing`              | `apps/server/test/`                             | Join/auth, input → patch, phases, draft messages                | `ci / verify`    |
| Client unit         | Vitest + React Testing Library (jsdom)    | `apps/client/app/**/*.test.tsx`                 | Routes, HUD, view-models, reconciler                            | `ci / verify`    |
| Render              | Vitest browser mode (Playwright Chromium) | `apps/client/app/game/render/*.browser.test.ts` | PixiJS scene graph, textures, tints                             | `ci / browser`   |
| DB                  | pgTAP via `supabase test db`              | `supabase/tests/`                               | RLS policies, SQL functions                                     | `integration`    |
| Repository contract | Vitest                                    | `apps/server/test/contract/`                    | One suite run against both InMemory and Supabase (local)        | `integration`    |
| E2E                 | Playwright                                | `apps/client/e2e/`                              | Full stack in docker compose with multiple browser contexts     | `e2e`            |
| Load                | `@colyseus/loadtest` + bot inputs         | `apps/server/loadtest/`                         | Tick duration and memory under N rooms                          | manual / nightly |

Browser-mode tests (Render row) need `@vitest/browser-playwright` installed as a dev dependency, with `test.browser.provider: playwright()` (imported from that package) set in the client's `vitest.config.ts` — the Playwright provider is a separate package, not bundled with `vitest`/`@vitest/browser`.

**Rule:** Anything that can be tested in `shared` gets tested there. Higher layers only check that the pieces are wired together correctly.

---

## Phase 1 — Foundation: Monorepo, Shared Types, CI/CD Skeleton

**Objective:** Stand up a buildable, lintable, testable monorepo where all three packages compile, `shared` is consumed by both apps, and every PR runs CI and builds both Docker images.

**Monorepo impact:** `shared` (created), `server` (scaffold), `client` (scaffold), root tooling.

### Implementation steps

1. **Workspace**
   - `pnpm-workspace.yaml` covering `apps/*` and `packages/*`. Package names are `@castle-clash/{shared,server,client}`.
   - `turbo.json` tasks: `build` (`dependsOn: ["^build"]`, `outputs: ["dist/**","build/**"]`), `typecheck` and `test` (`dependsOn: ["^build"]`), `lint`, and `dev` (`persistent: true`, `cache: false`).
   - Root `package.json` with a `packageManager` pin, `.nvmrc`, `.editorconfig`, and `.dockerignore`/`containerfile.containerignore` (identical content, kept in sync — see Version notes).
2. **TypeScript**
   - `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, and `moduleResolution: "bundler"` (client) or `"nodenext"` (server).
   - `shared` and `server` set `experimentalDecorators: true` and `useDefineForClassFields: false`, as required by `@colyseus/schema` decorators.
   - The `shared` tsconfig sets `lib: ["ES2023"]` and `types: []`. Any use of `window`, `document`, or `process` then fails typecheck, which enforces the isomorphic boundary.
3. **Lint/format:** ESLint flat config (typescript-eslint, react-hooks for client) and Prettier. `no-restricted-imports` blocks `shared` from importing `@castle-clash/server`, `@castle-clash/client`, `pixi.js`, `react`, or `@supabase/*`, and blocks `apps/client/app/game/**` from importing `react`.
4. **`packages/shared` skeleton** (built with `tsup` to ESM + `.d.ts`, with subpath exports `.` and `./testing`):
   - `config/game.ts`: `TICK_RATE = 60`, `PATCH_RATE = 20`, `MAX_PLAYERS = 6`, `ROUNDS_TO_WIN = 3`.
   - `types/`: branded `PlayerId`/`RoomId`, plus `WeaponId` (`sword | mace | spear`) and `ArenaId` (six values) as `const` objects with derived union types.
   - `input/bitmask.ts`: `InputFrame { seq: number; bits: number }`, with bits `LEFT RIGHT UP DOWN JUMP LIGHT HEAVY BLOCK DODGE`, and `encode`/`decode`/`has`.
   - `math/rng.ts`: seeded `mulberry32` plus `hashSeed(...parts)`.
   - `math/vec.ts` and `math/aabb.ts`.
5. **`apps/server` scaffold:** a Node entry point using `defineServer({ rooms, transport, express })` from the `colyseus` package (not the older `new Server()`/`.define()` shape) that imports and logs `TICK_RATE` from shared, built with `tsc`, run with `tsx watch` in dev.
6. **`apps/client` scaffold:** a React Router v8 SPA with one route that renders `TICK_RATE`, built with Vite.
7. **Containerfiles** (see Version notes: `containerfile`, not `Dockerfile` — the user builds locally with `podman`)
   - **Server** (multi-stage): `node:24-alpine` + corepack → `turbo prune @castle-clash/server --docker` → `pnpm install --frozen-lockfile` from `out/json` → copy `out/full` → `turbo build --filter=@castle-clash/server` → `pnpm deploy --filter=@castle-clash/server --prod /out` (no `injectWorkspacePackages`/`--legacy` needed under pnpm 12.2+) → slim runtime stage running as a non-root user.
   - **Client:** prune and build the same way, then copy into an `nginx-unprivileged` image with an SPA fallback. `entrypoint.sh` renders `config.js` from env vars (`GAME_SERVER_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`), so one image works in every environment.
8. **Docs:** `README.md` quickstart and `docs/adr/0001-shared-deterministic-sim.md` (records D1–D3).

### Testing strategy (gate to Phase 2)

- `shared/input/bitmask.test.ts`: all 2⁹ bit combinations round-trip through `encode`/`decode`, and unknown bits are rejected.
- `shared/math/rng.test.ts`: the same seed yields the same 1,000-value sequence, different seeds diverge, and a coarse bucket-distribution check passes.
- `shared/math/aabb.test.ts`: overlap, touching edges, and penetration-vector cases.
- `shared/config/game.test.ts`: invariants hold (`TICK_RATE % PATCH_RATE === 0`, `MAX_PLAYERS >= 2`).
- `server/src/smoke.test.ts` and `client/app/smoke.test.tsx`: import from `@castle-clash/shared` to prove workspace resolution works under Vitest.
- **Gate:** `pnpm turbo run lint typecheck test build` passes locally and in CI, and both images build (locally with `podman build`, in CI with `docker buildx` against the same `containerfile`s — see Version notes).

### CI/CD integration

- **`.github/workflows/ci.yml`** runs on `pull_request` and `push: main`. Job `verify`: checkout → `pnpm/action-setup` → `actions/setup-node` (cache `pnpm`) → `pnpm install --frozen-lockfile` → `pnpm turbo run lint typecheck test build`. Add `concurrency: ci-${{ github.ref }}` with `cancel-in-progress`. Turbo remote cache is optional (`TURBO_TOKEN`/`TURBO_TEAM` secrets).
- **`.github/workflows/docker.yml`** uses a matrix over `[server, client]` with `docker/setup-buildx-action`, `docker/metadata-action`, and `docker/build-push-action` (cache `type=gha`).
  - PRs build only (`push: false`) to validate the containerfiles.
  - Pushes to `main` log in to GHCR with `GITHUB_TOKEN` (`permissions: packages: write`) and push `ghcr.io/${{ github.repository_owner }}/castle-clash-{server,client}` tagged `sha-<short>` and `main`.
  - `v*` tags push semver tags.
- Branch protection requires `verify`, `docker (server)`, and `docker (client)`.
- Add `.github/dependabot.yml` for npm, docker, and github-actions.

---

## Phase 2 — Walking Skeleton: Client ↔ Server Round Trip

**Objective:** A browser joins a Colyseus room, and every connected player shows up as a colored rectangle on a PixiJS canvas. This proves the whole path end to end: routing, canvas mount, WebSocket, schema sync, and containers.

**Monorepo impact:** `shared` (schema, protocol), `server` (room, HTTP), `client` (GameCanvas, Pixi bootstrap).

### Implementation steps

1. **shared/schema:** `PlayerState { id, x, y, colorSeed }` and `MatchState { tick, players: MapSchema<PlayerState> }`.
2. **shared/protocol:** `MessageType` const object (`input`, `fx`, `draft:offer`, `draft:pick`, …) plus hand-rolled payload guards (`isInputFrame(u): u is InputFrame`). No zod in the hot path.
3. **server**
   - `index.ts`: `defineServer({ rooms: { match: defineRoom(MatchRoom) }, transport: new WebSocketTransport(), express: (app) => {...} })`, with Express routes `GET /healthz` (liveness) and `GET /readyz`. `@colyseus/monitor` is mounted only when `NODE_ENV !== "production"`.
   - `rooms/MatchRoom.ts`: `onCreate` sets state; `onJoin` adds a `PlayerState` at a spawn point; `onLeave` removes it.
   - Design for testability: tick scheduling goes through an injected `TickDriver` (`IntervalTickDriver` in prod via `setSimulationInterval`, `ManualTickDriver` in tests with `step(n)`).
4. **client**
   - `game/GameClient.ts`: `async start(container: HTMLElement, roomUrl)` → `await app.init({ resizeTo })` → connect → subscribe to state → `ticker.add(render)`. `destroy()` tears everything down.
   - `routes/play.tsx`: `<GameCanvas>` mounts `GameClient` in `useEffect` with cleanup, which also handles StrictMode double-mount.
   - `game/viewmodel/playersToRects.ts`: pure mapping from `MatchState` to `{id, x, y, tint}[]`. Pixi code only draws what the view-model returns.
5. **Local stack:** `docker-compose.yml` runs `server` (port 2567) and `client` (port 8080, `GAME_SERVER_URL=ws://localhost:2567`). `pnpm dev` runs both through turbo.

### Testing strategy (gate to Phase 3)

- `server/test/MatchRoom.join.test.ts` (`@colyseus/testing`): boot the server, connect two clients, and check that `state.players.size === 2` after `waitForNextPatch()`. When one leaves, the size drops to 1.
- `server/src/http.test.ts`: `/healthz` returns 200 (supertest against the Express app).
- `client/app/game/viewmodel/playersToRects.test.ts`: deterministic tint from `colorSeed`, and removed players disappear.
- `client/app/routes/play.test.tsx` (RTL): `GameClient` is mocked at the module seam. The test checks that `start` runs on mount and `destroy` runs on unmount.
- `client/app/game/render/PlayerRects.browser.test.ts` (Vitest browser mode): create a real Pixi `Application`, render two rects, and assert on the `stage.children` count, positions, and tints. No pixel diffs yet.
- **Gate:** two browser tabs see each other's rectangles when connected to the compose stack.

### CI/CD integration

- `ci.yml`: add job `browser` (install Playwright Chromium with cache, then `pnpm --filter client test:browser`).
- `docker.yml`: add job `smoke` (`needs: build`). It loads the built images (`outputs: type=docker` on PRs), runs `docker compose up -d --wait`, curls `/healthz` and the client `/`, and runs `apps/server/scripts/smoke-join.ts`, a headless `colyseus.js` client that joins a room and asserts that state arrives. **On `main`, the GHCR push job needs `smoke`**, so only images that pass the smoke test get published.

---

## Phase 3 — Deterministic Movement and Netcode

**Objective:** Authoritative platformer movement (run, jump, fall, one-way platforms), with client-side prediction and reconciliation for the local player and interpolation for remote players. It plays on one test arena.

**Monorepo impact:** `shared` (sim core, testing harness), `server` (input queue, tick loop), `client` (input capture, reconciler, interpolator).

### Implementation steps

1. **shared/sim**
   - `SimState { tick, players: Record<PlayerId, SimPlayer>, arena: ArenaRuntime }`, where `SimPlayer = { pos, vel, facing, grounded, coyoteTicks, jumpBufferTicks, lastInputSeq }`.
   - `physics.ts`: gravity, axis-separated AABB sweep against solids, one-way platforms (collide only when falling and previously above), and terminal velocity.
   - `movement.ts`: acceleration and friction curves, coyote time, jump buffering, variable jump height (release cuts upward velocity), and drop-through with DOWN+JUMP.
   - `GameSimulation.step(state, inputs: Record<PlayerId, InputFrame>): { state, events }` is a pure function. The only allowed randomness is `state.rngSeed`.
   - `math/hash.ts`: `hashState(state)` (FNV-1a over a canonical serialization) for determinism tests.
2. **shared/arenas:** `ArenaDefinition { id, bounds, solids: AABB[], platforms: AABB[], spawns: Vec[], killZones: AABB[], hazards: HazardDef[] }` plus one placeholder arena, `testbed`.
3. **shared/testing**
   - `SimHarness`: runs N ticks with scripted inputs.
   - `NetSim`: an in-memory "network" with configurable latency, jitter, and loss. It links one authoritative sim to K client predictors, so netcode can be tested without sockets.
   - `bots/scripted.ts`: input scripts for tests and load testing.
4. **server**
   - `InputQueue`: per-player ring buffer that rejects `seq <= lastSeq` and caps depth at 8 (drops the oldest, which blocks speed-hacking through input flooding). If a tick has no input, the last frame repeats for up to 6 ticks, then goes neutral.
   - `MatchRoom` tick: `drain inputs → GameSimulation.step → projectToSchema → set lastProcessedSeq`. `setPatchRate(1000 / PATCH_RATE)`.
   - Message validation: reject non-conforming `input` payloads and rate-limit to 2× `TICK_RATE` per second. Log and drop anything over the limit.
5. **client**
   - `input/KeyboardInput.ts`: key state → bits, sampled on the fixed-step accumulator rather than per render frame.
   - `net/Reconciler.ts`: keeps a buffer of pending `InputFrame`s. On a patch it discards acked inputs, resets the local `SimPlayer` to the server's values, and replays the pending inputs through `GameSimulation`. Errors below 4 px are smoothed over 100 ms; larger errors snap.
   - `net/Interpolator.ts`: keeps a snapshot buffer per remote player and renders at `serverTime − 100 ms`, holding the last value if the buffer runs dry (no extrapolation).
   - `GameClient` loop: fixed 60 Hz sim accumulator, with rendering interpolated between sim steps by `alpha`.

### Testing strategy (gate to Phase 4)

- `sim/physics.test.ts`: lands on solids, never tunnels at max velocity (sweep test), passes up through one-way platforms and lands on them from above, walls stop horizontal movement.
- `sim/movement.test.ts`: a jump inside the coyote window succeeds and outside it fails, a jump buffered 5 ticks before landing fires on landing, and short-hop height is less than full-jump height.
- `sim/determinism.test.ts`: the same seed and input script run twice produce identical `hashState` at every tick. A fast-check property test does the same with random input scripts.
- `shared/testing/NetSim.test.ts` (integration of pure pieces): at 120 ms RTT, 20 ms jitter, and 2% loss, the client's predicted position converges to within 1 px of the server within 10 ticks after input stops. The test also asserts that correction magnitude stays bounded.
- `server/src/rooms/InputQueue.test.ts`: rejects stale seq, caps depth, handles repeat-last/neutral timeout.
- `server/test/MatchRoom.movement.test.ts`: with `ManualTickDriver`, a client holds RIGHT for 60 ticks. After a patch, server `x` matches `SimHarness` running the same script exactly. Malformed input is dropped without crashing the room.
- `client/app/game/net/Reconciler.test.ts` and `Interpolator.test.ts`: pure unit tests with synthetic snapshots.
- **Gate:** at 150 ms simulated latency (Chrome DevTools or `NetSim`), local movement feels immediate and remote players move smoothly.

### CI/CD integration

- `ci.yml`: turn on Vitest coverage for `packages/shared` with thresholds (`sim/**` ≥ 90% lines), and upload the `coverage/` artifact.
- Property tests print the failing seed. CI sets `FC_SEED` from `github.run_id` so failures can be reproduced.

---

## Phase 4 — Combat System

**Objective:** Weighty, state-driven combat: light and heavy attacks, block, dodge, stamina, hitstun, knockback, and KOs. The Sword, Mace, and Spear differ in reach, speed, and properties. The client gets knight sprites, animations, and hit feedback.

**Monorepo impact:** `shared` (combat), `server` (fx events), `client` (KnightView, animation, Fx).

### Implementation steps

1. **shared/combat/fsm.ts:** the player action state machine is data-driven.
   - States: `Idle, Run, Airborne, AttackStartup, AttackActive, AttackRecovery, Block, BlockStun, Dodge, HitStun, GuardBroken, Dead`.
   - `transitions: Record<ActionState, (ctx) => ActionState | null>`. Cancel rules: recovery can cancel into dodge only on hit, and an airborne light attack has its own frame data.
   - `SimPlayer` gains `action, actionTick, attackKind, hp, stamina, hitstunTicks, invulnTicks`.
2. **shared/combat/weapons.ts:** frame data in ticks at 60 Hz. The values below are starting points for tuning.

   | Weapon | Light (startup/active/recovery) | Heavy       | Reach (px) | Trait                                           |
   | ------ | ------------------------------- | ----------- | ---------- | ----------------------------------------------- |
   | Sword  | 6 / 4 / 12                      | 16 / 5 / 22 | 70         | Balanced; light chains ×2                       |
   | Mace   | 9 / 4 / 16                      | 24 / 6 / 30 | 55         | Heavy breaks guard and deals big stamina damage |
   | Spear  | 8 / 3 / 14                      | 18 / 4 / 26 | 110        | Long poke with a sweet spot at the tip          |

   Each attack defines `damage, staminaDamage, knockback: Vec, hitstun, hitboxes: {tickOffset, box: AABB}[]` (relative to facing).

3. **shared/combat/resolve.ts:** `GameSimulation.step` runs these stages in a fixed order.
   1. Apply inputs to the FSM.
   2. Integrate physics.
   3. Gather active hitboxes.
   4. Test hurtboxes, iterating in sorted `PlayerId` order and computing every hit **before** applying any, so trades are order-independent.
   5. Block check: frontal only, reduces damage, drains stamina, and triggers GuardBroken at 0 stamina.
   6. Dodge i-frames skip the hit.
   7. Apply damage, knockback, and hitstun.
   8. Mark KO as `Dead`.
   9. Emit `SimEvent`s (`hit`, `blocked`, `guardBreak`, `ko`, `whiff`).
4. **server:** `broadcast("fx", events)` once per tick when events exist. Events are transient and never stored in schema. Schema adds `action`, `actionTick`, `hp`, `stamina`, and `weapon`.
5. **client**
   - `viewmodel/knightAnimation.ts`: pure `(action, actionTick, weapon) → {clip, frame}`.
   - `render/KnightView.ts`: a Pixi `Container` with layered `AnimatedSprite`s (body, weapon), flipped by `facing`.
   - `render/Fx.ts`: hit sparks, 3–6 tick hitstop (local render freeze), and screen shake scaled by damage.
   - Prediction: the local player's action and animation start are predicted, but HP changes only on server confirmation.
   - HUD: HP and stamina bars in React, fed by the throttled store.

### Testing strategy (gate to Phase 5)

- `combat/fsm.test.ts`: a table-driven test over every `(state × input)` pair checks the expected next state and blocked transitions (can't attack during HitStun, can't block while airborne).
- `combat/weapons.test.ts`: every attack has startup, active, and recovery ≥ 1, hitboxes appear only during active ticks, and reach ordering is Spear > Sword > Mace.
- `combat/resolve.test.ts`:
  - At distance 100 px, a spear light connects and a sword light whiffs.
  - Frontal block reduces damage and drains stamina, and a hit from behind ignores block.
  - A dodge started on tick k avoids a hit on tick k+iframes−1 and takes the one on k+iframes.
  - A mace heavy against a block at low stamina causes GuardBroken.
  - Knockback direction follows attacker facing.
  - A simultaneous trade produces identical results when player iteration order is shuffled.
- Property tests (fast-check) across random combat input scripts: `0 ≤ hp ≤ maxHp`, `0 ≤ stamina ≤ max`, `Dead` is terminal within a round, and determinism hash stability holds.
- `combat/ttk.test.ts` (balance regression guard): bots duel for every weapon matchup, and the median time-to-kill stays within designed bands (for example 6–14 s). A deliberate tuning change updates the bands.
- `server/test/MatchRoom.combat.test.ts`: A attacks B in range. After a patch B's `hp` has dropped, and B's client receives an `fx` message with a `hit` event.
- `client/.../knightAnimation.test.ts`: every `ActionState × WeaponId` maps to an existing clip, and frames stay within clip length.
- `client/.../KnightView.browser.test.ts`: loads a spritesheet fixture, then checks that the correct texture frame and `scale.x` sign match facing.
- **Gate:** a two-player local duel is playable, and all combat invariants pass.

### CI/CD integration

- `ci.yml`: add an asset validation step, `pnpm --filter client assets:check`, which verifies that every clip referenced in the animation map exists in `manifest.json` and that spritesheets stay within the size budget.
- The `browser` job now covers the KnightView tests. Its Playwright cache key includes the lockfile hash.

---

## Phase 5 — Match Flow, Rounds, and Matchmaking

**Objective:** Complete matches: lobby, countdown, rounds, eliminations, round and match winners, reconnection, quick play, and private rooms by code. Stats counters are kept in memory only until Phase 8.

**Monorepo impact:** `shared` (match phase FSM, config), `server` (MatchDirector, matchmaking), `client` (lobby, results UI).

### Implementation steps

1. **shared/match/phase.ts:** a pure FSM: `Waiting → Countdown → RoundActive → RoundOver → Draft → Countdown … → MatchOver`. `Draft` is a pass-through stub until Phase 7. Transition inputs: `playerCount`, `aliveCount`, `ticksInPhase`, and `roundsWon`. Config: `MIN_PLAYERS = 2`, `COUNTDOWN_TICKS`, `ROUND_OVER_TICKS`, `ROUNDS_TO_WIN`, and `ROUND_TIME_LIMIT` (sudden death shrinks the arena or ramps up damage).
2. **Elimination sources:** HP reaching 0, entering a kill zone, or disconnecting during `RoundActive` all count as an elimination. `SimEvent` `eliminated { victim, by?, cause }` credits the last attacker within 3 s for ring-outs.
3. **server**
   - `match/MatchDirector.ts` runs the phase FSM on each tick. It resets `SimState` between rounds (respawns, HP and stamina), accumulates `MatchStats` (eliminations, deaths, rounds won, damage dealt), and emits a `MatchResult` DTO at `MatchOver`.
   - Matchmaking: `defineRoom(MatchRoom).filterBy(["mode","code"])` inside the server's `defineServer({ rooms })` config. Quick play uses `joinOrCreate("match", {mode:"quick"})`. Private rooms use `create("match", {mode:"private", code})`, where a 6-character code is generated server-side and stored in metadata.
   - Rooms lock during `RoundActive`, so late joiners wait or spectate.
   - `onLeave(client, consented)`: if the leave wasn't consented, `allowReconnection(client, 20)`. The player counts as eliminated for the current round but keeps their seat for the match.
   - Schema adds `phase, round, phaseEndsAtTick, roundsWon, alive, spectator`.
4. **client:** routes `lobby` (quick play, create or join by code), `play.$roomId` (HUD with phase banner and countdown), and a results overlay. On disconnect the client reconnects with the stored `reconnectionToken`.

### Testing strategy (gate to Phase 6)

- `match/phase.test.ts`: covers every transition and edge case. Countdown aborts if a player leaves and the count drops below minimum, a 1v1 double KO resolves as a draw round with no points, `ROUNDS_TO_WIN` ends the match, and the time limit triggers sudden death.
- `server/src/match/MatchDirector.test.ts` (pure, with `SimHarness`): a scripted 3-round match produces the expected `MatchResult` aggregates, and ring-out credit goes to the last attacker.
- `server/test/MatchRoom.flow.test.ts`: two clients go Waiting → Countdown → RoundActive. Force a KO; after a patch the phase is `RoundOver`, then a new round starts with full HP.
- `server/test/MatchRoom.reconnect.test.ts`: dropping a connection without consent leaves the seat reserved, and reconnecting within 20 s restores the same `PlayerId`.
- `server/test/matchmaking.test.ts`: a wrong private code can't join, and quick play never lands in private rooms.
- **Gate:** a full best-of-5 plays end to end across two browsers with a results screen.

### CI/CD integration

- **`.github/workflows/e2e.yml`** runs on PRs to `main` (path-filtered to `apps/**`, `packages/**`) and nightly. It builds images, starts `docker compose up -d --wait`, and runs Playwright in the `mcr.microsoft.com/playwright` container.
  - `e2e/private-match.spec.ts`: context A creates a private room and reads the code. Context B joins. Both see the countdown, and holding RIGHT in A changes A's position as seen through `window.__CC_DEBUG__` (a debug hook compiled in only when `VITE_E2E=1`).
- The job uploads the Playwright trace and video on failure. `docker.yml` also publishes a `:e2e`-flavored client build argument, or E2E builds locally with the debug flag. Production images never include the debug hook.

---

## Phase 6 — Arenas and Hazards

**Objective:** Six data-driven arenas with platforms, hazards, and breakable floors, plus a dynamic camera and arena art.

**Monorepo impact:** `shared` (arenas, hazards, validator), `server` (hazard state sync, arena rotation), `client` (ArenaView, HazardView, Camera, asset bundles).

### Implementation steps

1. **shared/hazards:** a closed union `HazardDef`, where each kind is a pure `step` function over `HazardState`.
   - `FireZone { box, dps, cycle?: {onTicks, offTicks} }`: damage over time plus a small hitstun-free knockback.
   - `BreakableFloor { box, hp, breakOn: "heavy" | "any" | "landing", respawnPerRound }`: acts as a solid while `hp > 0`.
   - `KillZone { box }`: instant elimination.
   - `TimedTrap { box, damage, knockback, periodTicks, warnTicks }`: telegraphed via `warn` state.
   - `CollapsingPlatform { box, delayTicks }`: falls after being stood on.
2. **shared/arenas:** one file per arena. Geometry is authored in Tiled and exported to JSON, then turned into typed definitions by `scripts/import-tiled.ts`. Hand-written TS is fine to start.

   | Arena       | Layout highlights                         | Hazards                                         |
   | ----------- | ----------------------------------------- | ----------------------------------------------- |
   | Pit         | Two ledges around a central drop          | KillZone pit, CollapsingPlatform bridge pieces  |
   | Castle Room | Chandelier one-way platforms, throne dais | FireZone braziers (cycled)                      |
   | Colosseum   | Wide flat floor, raised stands            | TimedTrap floor spikes                          |
   | Bridge      | Long and narrow, open sides               | BreakableFloor planks, side KillZones           |
   | Wooden Hall | Multi-level balconies                     | BreakableFloor sections (heavy), one-way stairs |
   | Dungeon     | Low ceiling, tight corridors              | FireZone pits, TimedTrap portcullis             |

3. **Arena validator** `arenas/validate.ts`: spawns are in bounds and not overlapping solids, every spawn is above ground reachable by gravity, hazards stay in bounds, at least one KillZone or solid floor exists below all platforms, and IDs are unique.
4. **server:** arena rotation per round or match (config: `random | vote | fixed`). `MatchState.hazards: MapSchema<HazardState {id, kind, active, hp, phase}>` syncs only dynamic state. Static geometry is never sent, because the client loads it from `shared` by `arenaId`. Breakable floors reset between rounds.
5. **client**
   - `render/ArenaView.ts` builds background, parallax, and tile layers from a Pixi `Assets` bundle for each arena (`manifest.json` `bundles: arena-pit, …`), loaded during Countdown with a progress UI.
   - `HazardView` animates warn, active, and broken states from synced state.
   - `Camera` fits all living players with a lerped zoom clamped to arena bounds, and shakes on events.
   - Fixed-step physics with collision against dynamic solids (breakable floors) uses the same shared code, so the client predicts local collisions correctly.

### Testing strategy (gate to Phase 7)

- `arenas/validate.test.ts`: a table-driven `describe.each(ALL_ARENAS)` runs the validator. It also spawns a `SimPlayer` at every spawn point and runs gravity for 120 ticks, asserting that each player is grounded and alive.
- `hazards/*.test.ts`: fire cycles on and off at exact ticks, standing in fire for 60 ticks deals `dps` ± 1, a heavy attack breaks a floor of matching HP but a light attack doesn't (`breakOn: "heavy"`), a player on a broken floor falls, a KillZone eliminates in one tick, and a TimedTrap warns before it activates.
- `sim/determinism.test.ts` extended: determinism holds with hazards active on every arena.
- `server/test/MatchRoom.hazards.test.ts`: breaking a floor in round 1 syncs `hp=0` to clients, and round 2 restores it.
- `client/.../Camera.test.ts`: pure framing math, where two players at arena extremes give zoom equal to the clamp minimum and one player centers on that player.
- `client/e2e/arena-visual.spec.ts`: a Playwright screenshot per arena with a deterministic camera and no players, compared with a `maxDiffPixelRatio` threshold. Snapshots are committed.
- **Gate:** all six arenas pass validation and have been playtested, and visual baselines are approved.

### CI/CD integration

- `e2e.yml`: the visual regression spec runs in the pinned Playwright container, which renders consistently. Adding the `update-snapshots` label to a PR triggers a job that regenerates the baselines and commits them back.
- `ci.yml`: add a client bundle budget (`size-limit` on the initial JS chunk; arena bundles are lazy) and extend `assets:check` to cover the arena bundles.

---

## Phase 7 — Roguelike Power-up Draft

**Objective:** Between rounds, each player chooses one of three seeded power-up offers. Power-ups stack for the rest of the match and modify stats or add constrained special effects.

**Monorepo impact:** `shared` (power-up defs, stat computation, offer generation), `server` (DraftService, private messages), `client` (draft UI).

### Implementation steps

1. **shared/powerups/types.ts:** `PowerUpDef { id, rarity, tags, maxStacks, modifiers: StatModifier[], effects?: EffectDef[] }`.
   - `StatModifier { stat, op: "add" | "mul", value }` covers `moveSpeed, jumpVelocity, maxHp, staminaMax, staminaRegen, lightDamage, heavyDamage, reach, attackSpeed, dodgeIFrames, blockStaminaCost, knockbackResist`.
   - `EffectDef` is a **closed, serializable union**: `lifesteal {pct}`, `thorns {pct}`, `doubleJump`, `fireImmune`, `ringOutArmor {charges}`. Each one is implemented in the sim (no arbitrary callbacks), so it stays deterministic and testable.
2. **shared/powerups/computeStats.ts:** `computeStats(base, weaponDef, stacks: Record<PowerUpId, number>): DerivedStats`. Additive modifiers apply first, then multiplicative, then per-stat clamps. Attack frame data scales by `attackSpeed`, rounded and never below 1 tick.
3. **shared/powerups/offers.ts:** `generateOffers(rng, ownedStacks, placement, pool) → [PowerUpId, PowerUpId, PowerUpId]`. It weights by rarity, excludes power-ups at `maxStacks`, avoids duplicates within an offer, and boosts rarity for players who lost the round (catch-up, configurable). The seed is `hashSeed(matchSeed, round, playerId)`.
4. **server/match/DraftService.ts:** on entering `Draft`, it sends each player a private `client.send("draft:offer", {offers, endsAtTick})`. It validates `draft:pick` (id must be in that player's offers, once only), auto-picks randomly with the seeded RNG on timeout, and moves to `Countdown` when everyone has picked or the timer runs out. Schema: `PlayerState.powerups: ArraySchema<string>` is public, so opponents can see builds. Offers stay private.
5. **client:** a `DraftOverlay` React component with three cards, a timer, and the opponents' current builds. `GameClient` uses `computeStats` so local prediction uses derived stats.

### Testing strategy (gate to Phase 8)

- `powerups/computeStats.test.ts`: example-based ordering (add before mul) plus fast-check properties. For any combination of stacks, every derived stat stays within its clamp, attack ticks stay ≥ 1, and zero stacks equals the base weapon stats.
- `powerups/offers.test.ts`: the same seed gives the same offers, offers contain three unique IDs, none are at `maxStacks`, and a 10k-sample rarity distribution stays within tolerance of the weights. The pool-exhaustion edge case falls back to common stat boosts.
- `powerups/effects.test.ts`: lifesteal heals by the correct amount on hit and never above maxHp, doubleJump allows exactly one extra jump before landing, fireImmune ignores FireZone damage, and ringOutArmor consumes a charge instead of eliminating.
- `server/src/match/DraftService.test.ts`: a pick outside the offer set is rejected, a double pick is rejected, and a timeout auto-picks deterministically.
- `server/test/MatchRoom.draft.test.ts`: after a round ends, each client receives only its own `draft:offer` (the test asserts client B never sees A's offers). After both pick, `powerups` sync and the next round starts.
- `client/app/ui/DraftOverlay.test.tsx`: renders the offers, clicking sends the pick, and the UI disables after picking or on timeout.
- **Gate:** a full match with drafts is playable, and power-ups visibly change feel without breaking invariants.

### CI/CD integration

- Add a scheduled workflow job `balance-report` (nightly): `pnpm --filter shared sim:balance` runs thousands of bot matches with random drafts and uploads a Markdown/CSV artifact (win rate by weapon and power-up). Nothing blocks on it; it tracks trends for tuning.

---

## Phase 8 — Auth and Persistent State (Supabase)

**Objective:** Players sign in (including anonymous guests who can upgrade later). The server verifies identity, loads each player's persisted loadout, and records match results and stats transactionally.

**Monorepo impact:** `shared` (DB types, cosmetics catalog types), `server` (auth, repository), `client` (auth flows, protected routes), plus `supabase/`.

### Implementation steps

1. **Supabase project and local dev:** `supabase init` and `supabase start` locally. All schema changes go through `supabase/migrations/*.sql`, never through the dashboard.
2. **Schema (migrations)**
   - `profiles (id uuid pk → auth.users, display_name citext unique, created_at)`, created by an `on auth.users insert` trigger.
   - `player_loadouts (player_id pk → profiles, weapon text, tint_primary int, tint_secondary int, helmet_id text, cape_id text, weapon_style_id text, updated_at)`, with `CHECK` constraints on the tint range.
   - `player_unlocks (player_id, item_id, unlocked_at, pk(player_id,item_id))`.
   - `matches (id uuid pk, arena_ids text[], mode text, started_at, ended_at, winner_id uuid null, server_version text)`.
   - `match_participants (match_id, player_id, placement, rounds_won, eliminations, deaths, damage_dealt, powerups text[], pk(match_id, player_id))`.
   - `player_stats (player_id pk, matches_played, wins, eliminations, deaths, rounds_won, updated_at)`.
   - `record_match_result(payload jsonb)`: `security definer`, with `EXECUTE` granted **only** to `service_role`. It inserts the match and participants and upserts `player_stats` counters in one transaction. It's idempotent: a conflict on `matches.id` returns early.
3. **RLS**
   - `profiles`: authenticated users can read; users can update only their own row.
   - `player_loadouts`: select and upsert only your own row, with a policy check that any cosmetic ID is `null`, a default, or present in `player_unlocks` for that user.
   - `player_unlocks`, `matches`, `match_participants`: select only, with no insert policies (writes happen only through the service role).
   - `player_stats`: public read through a `leaderboard` view exposing `display_name` and counters only.
   - Note: `service_role`/`anon`/`authenticated` above are Postgres/RLS role names, distinct from the `SUPABASE_SECRET_KEY`/`SUPABASE_PUBLISHABLE_KEY` API keys used elsewhere in this doc to authenticate as those roles — Supabase's 2026 key rename affects only the API keys, not these role names.
4. **Types:** `supabase gen types typescript --local > packages/shared/src/db/database.types.ts`.
5. **server**
   - `auth/verifyToken.ts`: `jose` `createRemoteJWKSet(SUPABASE_URL/auth/v1/.well-known/jwks.json)`, then `jwtVerify` checks issuer and audience and returns `{ userId, isAnonymous }`. The JWKS response is cached.
   - `MatchRoom.onAuth` is the current static three-argument form, `static async onAuth(token, options, context)`, where the client's auth token is `context.token`. It rejects missing or invalid tokens. The Colyseus `PlayerId` is mapped to the Supabase `userId`, and the same user can't hold two seats.
   - `persistence/PlayerRepository.ts` interface: `getLoadout(userId)`, `recordMatch(result: MatchResult)`, `getUnlocks(userId)`. Implementations: `SupabasePlayerRepository` (supabase-js with the **secret key**, server-only env) and `InMemoryPlayerRepository`.
   - `MatchOver` → `recordMatch` goes through a retry-with-backoff queue. Failures are logged and exported as a metric and never crash the room. The match ID is generated at room creation for idempotency.
6. **client**
   - `auth/supabase.ts` is the only module that imports `@supabase/supabase-js`, so it's the mock seam.
   - Sign-in by magic link, OAuth (Discord/Google), or "Play as guest" (anonymous sign-in), with later account linking.
   - A route-level `clientLoader` guard on `lobby`, `play`, `loadout`, and `stats`. The access token is passed when joining the room and refreshed before reconnecting.

### Testing strategy (gate to Phase 9)

- `supabase/tests/rls.test.sql` (pgTAP):
  - User A can't select or update B's loadout.
  - A loadout with a locked `helmet_id` is rejected.
  - `authenticated` and `anon` can't insert into `match_participants` or call `record_match_result`.
  - The `leaderboard` view exposes no email or `auth` columns.
- `supabase/tests/record_match_result.test.sql`: counters increment correctly, and calling twice with the same match ID doesn't double-count.
- `server/src/auth/verifyToken.test.ts`: generates an RS256/ES256 key pair with `jose` and serves a local JWKS (injected fetcher). The test covers a valid token, expired, wrong issuer, wrong audience, and a tampered signature.
- `server/test/contract/PlayerRepository.contract.ts`: one shared suite, run as `InMemoryPlayerRepository.contract.test.ts` in unit CI and `SupabasePlayerRepository.contract.test.ts` against local Supabase in integration CI.
- `server/test/MatchRoom.auth.test.ts`: joining without a token fails, and a duplicate seat for the same user is rejected. A completed match calls `repo.recordMatch` exactly once with the aggregates from `MatchDirector` (via `InMemoryPlayerRepository` spy). If the repository throws, the room still reaches `MatchOver` and disposes cleanly.
- `client/app/routes/*.test.tsx`: mocks `auth/supabase.ts` with `vi.mock`. Unauthenticated users are redirected to `/login`, the guest button calls anonymous sign-in, and the token is forwarded to `GameClient.start`.
- **Gate:** a signed-in player finishes a match and their `player_stats` row updates, and a guest's stats persist after linking an account.

### CI/CD integration

- **`.github/workflows/integration.yml`** runs on PRs touching `supabase/**`, `apps/server/**`, or `packages/shared/**`:
  1. `supabase/setup-cli`, then `supabase start` (excluding unneeded services such as studio).
  2. `supabase db reset`, which applies all migrations from scratch.
  3. `supabase db lint`.
  4. `supabase test db` (pgTAP).
  5. The server contract suite against the local instance.
  6. A **generated types freshness check**: regenerate `database.types.ts`, then `git diff --exit-code`.
- Secrets: none in CI, since everything runs against local Supabase. Staging and production values (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_DB_PASSWORD`) live in GitHub **Environments** and are used only in Phase 10.
- `e2e.yml`: the compose stack now runs against a CLI-started local Supabase, and specs sign in as anonymous users.

---

## Phase 9 — Customization and Stats UI

**Objective:** A loadout editor with a live Pixi preview (tint, helmet, cape, weapon style), server-validated cosmetics visible to all players in a match, unlock rewards, and stats and leaderboard pages.

**Monorepo impact:** `shared` (cosmetics catalog, unlock rules), `server` (loadout on join, unlock evaluation), `client` (loadout route, KnightView layers, stats pages), plus a `supabase/` migration for unlock seeding if needed.

### Implementation steps

1. **shared/cosmetics/catalog.ts:** a versioned catalog `{ id, slot: "helmet" | "cape" | "weaponStyle", textureKey, unlock: UnlockRule }`. `UnlockRule` is a closed union: `default`, `wins {n}`, `eliminations {n}`, `matchesPlayed {n}`, `winWithWeapon {weapon, n}`. `evaluateUnlocks(stats, owned) → newlyUnlocked[]` is a pure function.
2. **Rendering:** knight art is drawn in greyscale with a separate mask layer per tint channel.
   - `KnightView` layers: `cape` (behind), `body` (tint primary), `trim` (tint secondary), `helmet`, `weapon` (style texture keyed by `weaponId + styleId`). All layers share the animation clip and frame.
   - The cape gets a lightweight secondary motion: a `MeshRope` driven by velocity, rendered only on the client.
3. **server:** `onJoin` loads the loadout with `repo.getLoadout`, re-validates it against `repo.getUnlocks` and the catalog (invalid → default), and writes `PlayerState.cosmetics` (schema `CosmeticsState`). Client-supplied cosmetics are never trusted. Weapon _selection_ (gameplay) comes from the lobby choice, bounded to `WeaponId`. After `recordMatch` succeeds, the server runs `evaluateUnlocks` and inserts new unlocks through the repository. A `profile:unlocks` message notifies the player.
4. **client**
   - `routes/loadout.tsx`: React form controls (color pickers limited to the palette, slot carousels with lock badges) plus a `<KnightPreview>` that mounts a small Pixi app reusing `KnightView` with an idle animation. It saves via supabase-js upsert, and RLS enforces ownership.
   - `routes/stats.tsx`: the player's counters and the last 20 matches from `match_participants`. `routes/leaderboard.tsx` reads the `leaderboard` view with pagination.

### Testing strategy (gate to Phase 10)

- `cosmetics/catalog.test.ts`: IDs are unique, every `textureKey` exists in the client asset manifest (via a generated key list in shared), and every slot has a `default` item.
- `cosmetics/unlocks.test.ts`: covers threshold boundaries (n−1 doesn't unlock, n does), already-owned items are never re-emitted, and `winWithWeapon` counts only that weapon.
- `client/.../viewmodel/knightLayers.test.ts`: `(cosmetics, action, frame) → layer list` gives the correct order, texture keys, and tints, and a missing texture falls back to the default.
- `client/.../KnightView.browser.test.ts` extended: applying tint `0xff0000` sets `body.tint`, swapping the helmet changes the texture without re-creating the container, and flipping preserves layer order.
- `server/test/MatchRoom.cosmetics.test.ts`: a repository fake returns a loadout with an unowned helmet, and other clients see the default helmet in `state`. A valid loadout propagates to all clients.
- `server/src/match/unlocks.integration.test.ts`: a match result that crosses a threshold inserts an unlock and sends `profile:unlocks`.
- `e2e/customization.spec.ts`: a guest changes tint, saves, and joins a private room. The opponent context reads the player's tint via the debug hook. After the match, `/stats` shows `matches_played` incremented.
- **Gate:** cosmetics persist across sessions, all players see them, and they can't be spoofed.

### CI/CD integration

- `ci.yml`: `assets:check` now cross-validates `shared` catalog texture keys against `apps/client/public/assets/manifest.json`.
- The E2E customization spec joins the required checks for `main`.

---

## Phase 10 — Production Hardening and Deployment

**Objective:** Make the stack operable and secure, and deploy it through a gated pipeline: release, then images, then DB migration, then server, then client, with health verification and rollback.

**Monorepo impact:** `server` (shutdown, observability, limits), `client` (runtime config, CSP, error reporting), plus infra and workflows.

### Implementation steps

1. **Server operability**
   - Structured logs with `pino` (roomId, matchId, userId), and a `/metrics` endpoint via `prom-client`: CCU, rooms by phase, tick duration histogram, patch bytes per second, input drops, and `recordMatch` failures.
   - Graceful shutdown: on `SIGTERM` the server stops accepting new rooms, lets running matches finish up to a `DRAIN_TIMEOUT` (for example 10 min), then disposes. `/readyz` returns 503 while draining.
   - Guardrails: max rooms per process, join rate limit per IP and user, max message size, and a room-level input abuse kick.
   - Colyseus `publicAddress` is set so multi-instance deployments route reconnections correctly. Horizontal scaling via `@colyseus/redis-presence` and `@colyseus/redis-driver` is turned on only when more than one process is needed. Start with a single process, scaled vertically.
2. **Client:** runtime `config.js` (from Phase 1) and a CSP header in nginx restricting `connect-src` to the game server and Supabase origins. Error reporting (for example Sentry) is optional, with DSN from runtime config. Hashed assets are served with immutable cache headers; `index.html` and `config.js` are `no-cache`.
3. **Hosting (target-agnostic):** any container host that supports long-lived WebSockets, such as Fly.io, a VPS with `docker compose` + Caddy for automatic TLS and WSS, or Kubernetes. Requirements: TLS termination with WebSocket upgrade, an idle timeout above the Colyseus ping interval, and deploy strategies that **drain** old instances instead of killing them.
4. **Releases:** release-please (or Changesets) opens release PRs, and merging one tags `vX.Y.Z`. `server_version` is stamped into images via `--build-arg` and recorded in `matches`.
5. **Load test:** `apps/server/loadtest/bots.ts` uses `@colyseus/loadtest` with scripted bot inputs from `shared/testing`. Target budget: tick p95 < 8 ms with 20 concurrent 6-player rooms on a single 2 vCPU instance. Tune after measuring.

### Testing strategy (gate to launch)

- `server/src/shutdown.test.ts`: while SIGTERM draining is in progress, `/readyz` is 503, new `create` calls are rejected, and an in-progress match (manual tick) completes and calls `recordMatch` before exit.
- `server/src/observability/metrics.test.ts`: tick histogram and CCU gauge update with simulated ticks and joins.
- `server/test/MatchRoom.abuse.test.ts`: oversized messages are rejected, flooding past the rate limit triggers a kick, and join rate limiting returns an error.
- `client/docker/entrypoint.test.sh` (bats or a node script): the container renders `config.js` from env vars and refuses to start if a required var is missing.
- Load test run with its report attached to the release PR, compared with the budget.
- `deploy smoke`: a post-deploy script checks `/healthz`, loads the client, does an anonymous sign-in against the environment's Supabase, has headless clients join and leave a room, and confirms a test match write (flagged `mode: "smoke"`, excluded from leaderboards).

### CI/CD integration

- **`docker.yml` on `v*` tags:** builds multi-arch images (`linux/amd64,linux/arm64`) with `provenance: true` and `sbom: true`. A Trivy scan fails on CRITICAL vulnerabilities. Tags: `vX.Y.Z`, `X.Y`, `sha-<short>`. The job outputs **image digests**.
- **`.github/workflows/deploy.yml`** (`workflow_run` after a successful tag build, or `workflow_dispatch` with a version input):
  1. `staging` environment (auto): `supabase db push --db-url ${{ secrets.SUPABASE_DB_URL }}` (migrations are forward-compatible, following expand/contract), then deploy the server image **by digest** and wait for `/readyz`, then deploy the client image by digest, then run `deploy smoke`.
  2. `production` environment (required reviewers): the same steps with production secrets. Old server instances drain.
  3. `rollback` job (`workflow_dispatch`): redeploy the previous digest. DB rollback is never automatic, which is why the expand/contract migration discipline matters.
- Required checks before tagging: `verify`, `browser`, `integration`, `e2e`, `docker (server/client)`, `smoke`.
- Dependabot and the weekly nightly workflow (`e2e`, `balance-report`, Trivy re-scan of the `main` images) keep the pipeline healthy.

---

## Appendix A — Workflow Summary

| Workflow          | Trigger                                      | Jobs                                                                                                | Introduced     |
| ----------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------- |
| `ci.yml`          | PR, push main                                | `verify` (lint/typecheck/test/build + coverage), `browser` (Pixi render tests), asset/bundle checks | P1, P2, P4, P6 |
| `docker.yml`      | PR (build only), main (push), `v*` (release) | matrix build → `smoke` (compose) → push GHCR → scan/SBOM on tags                                    | P1, P2, P10    |
| `e2e.yml`         | PR to main (path filter), nightly            | compose stack + Playwright (+ visual regression, local Supabase)                                    | P5, P6, P8     |
| `integration.yml` | PR touching server/shared/supabase           | Supabase local: migrations, lint, pgTAP, repo contract, types freshness                             | P8             |
| `nightly.yml`     | cron                                         | balance report, full E2E, image re-scan                                                             | P7, P10        |
| `deploy.yml`      | after tag build / manual                     | staging → prod (approval) → smoke; rollback                                                         | P10            |

## Appendix B — Open Decisions (resolve before the relevant phase)

1. **Players per match** (P5): 1v1 focus versus 2–6 free-for-all. This affects arena scale, camera, and patch rate.
2. **Arena selection** (P6): random, vote, or loser-picks.
3. **Guest stats** (P8): whether anonymous users appear on leaderboards before linking an account.
4. **Hosting target** (P10): this determines the concrete deploy step in `deploy.yml`.
5. **Art pipeline** (P4/P6): commissioned or asset packs, and Aseprite → TexturePacker export conventions.
6. **Ranked play**: out of scope here. The `matches` and `match_participants` schema can support a later ELO/Glicko phase.
