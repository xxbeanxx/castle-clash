# Handoff: Castle Clash — Phase 2 (Walking Skeleton)

## Goal for the next session

Implement **Phase 2 — Walking Skeleton: Client ↔ Server Round Trip** from
`docs/IMPLEMENTATION_PLAN.md`. Phase 1 (Foundation) is done and its gate passed. Don't start Phase
3 until Phase 2's gate passes (two browser tabs see each other's rectangles via the compose stack).

## Source of truth

- **Plan:** `docs/IMPLEMENTATION_PLAN.md`. Follow it; don't restate it. Phase 2's section covers
  `shared/schema` and `shared/protocol`, the server's Colyseus bootstrap and `MatchRoom`, the
  client's `GameClient`/`play.tsx`/`playersToRects`, and the local `docker-compose.yml` stack.
- **`docs/research/phase1-version-assumptions.md`** already verified the Colyseus/`@colyseus/schema`
  facts Phase 2 needs, against the actually-installed packages (not just docs) — items 2 and 3:
  server bootstrap is `defineServer({ rooms, transport, express })` / `defineRoom(Room).filterBy([...])`
  from the `colyseus` package (not `.define().filterBy()`), `onAuth` is
  `static async onAuth(token, options, context)` with the token at `context.token`,
  `@colyseus/schema` needs `experimentalDecorators`/`useDefineForClassFields: false` (already set
  in `apps/server/tsconfig.json` and `packages/shared/tsconfig.json`), and `@colyseus/testing`'s
  `boot()`/`connectTo()`/`waitForNextPatch()` are unchanged. Check it before re-deriving any of
  this from scratch.
- **`docs/adr/0001-shared-deterministic-sim.md`**: the sim/schema separation (D1–D3) that
  `shared/schema` and the eventual `projectToSchema()` step have to respect.
- **`CLAUDE.md`**: commands, architecture, and the containerfile gotchas found in Phase 1. Keep it
  current as Phase 2 adds real structure (rooms, schema, a `docker-compose`/`compose.yaml` stack) —
  it's meant to save the next session from rediscovering things this one already worked out.

## Current state (as of 2026-09-14, end of Phase 1)

- Repo: `/home/gbaker/Projects/github/xxbeanxx/castle-clash`, branch `main`, **15 commits, nothing
  pushed** (push wasn't requested). Remote is `git@github.com:xxbeanxx/castle-clash.git`.
- Phase 1 is complete: pnpm workspace + Turborepo tooling, `packages/shared` (config/types/
  input/math, tested, plus an empty `./testing` subpath placeholder for Phase 3), minimal
  `apps/server` (logs `TICK_RATE`, **no Colyseus dependency yet** — that's this phase), a React
  Router v8 SPA `apps/client` (one route rendering `TICK_RATE`), containerfiles for both apps, CI
  (`ci.yml`, `docker.yml`, `dependabot.yml`), README, ADR 0001, and `CLAUDE.md`.
- `pnpm turbo run lint typecheck test build` passes (12/12 tasks, 28 tests). Both containerfiles
  were **actually built and run with `podman`** (not just dry-run) — the server container logs
  and exits cleanly, the client container serves `config.js`/`index.html`/SPA-fallback routes
  correctly and refuses to start without its required env vars.
- Two rounds of `code-review` (Standards + Spec axes) ran against Phase 1's commits; findings were
  fixed in follow-up commits, not just noted.

## Toolchain on this machine

- **Node 24** (distro package, not the official nodejs.org build) — **no `corepack` binary**.
  pnpm was installed via `npm install -g pnpm@12.4.1` using an explicit `--prefix
$HOME/.npm-global` (an env-set `npm_config_prefix=/usr/local`, not writable, otherwise shadows
  the user `.npmrc` prefix). Add `export PATH="$HOME/.npm-global/bin:$PATH"` before pnpm/npx
  commands in each new shell — it isn't on `PATH` by default and persisting it into shell rc files
  was denied (out-of-repo persistence).
- **TypeScript is pinned to 6.0.3, not `latest`.** `typescript@latest` on npm is now 7.0.x, a
  native compiler with no programmatic compiler API until 7.1 — `typescript-eslint` can't run
  against it yet. Don't bump this without re-checking `typescript-eslint`'s peer range.
- **`podman` 5.8.4 is installed** (this wasn't checked at the start of the previous session, which
  had only confirmed `docker` was absent — don't assume a tool is missing without checking it
  specifically). `docker` is genuinely not installed. Build containers with:
  ```sh
  podman build --ignorefile=containerfile.containerignore -f apps/server/containerfile -t castle-clash-server .
  podman build --ignorefile=containerfile.containerignore -f apps/client/containerfile -t castle-clash-client .
  ```
- **Neither `podman-compose` nor a `podman compose` subcommand is installed.** Phase 2 step 5
  calls for a `docker-compose.yml` local stack (server + client). Before writing it: decide the
  filename with the user (`compose.yaml` is the vendor-neutral Compose Spec name both Docker and
  Podman recognize, unlike the `Dockerfile`→`containerfile` rename which had no neutral option),
  and expect to validate it by hand-inspecting rather than actually running it, unless
  `podman-compose` gets installed first — ask before installing new system packages.
- **`supabase` CLI is still not installed.** Not needed until Phase 8; irrelevant to Phase 2.

## A dependency gotcha you'll hit immediately

Adding `colyseus` as a real dependency in `apps/server` (Phase 2 step 3) pulls in
`@colyseus/uwebsockets-transport`, which depends on the git-hosted `uWebSockets.js` package (not
on npm — its license terms don't allow that). pnpm 12's `blockExoticSubdeps` (on by default)
refuses this as a transitive dependency with `ERR_PNPM_EXOTIC_SUBDEP`, even though we plan to use
the plain `WebSocketTransport`, not the uWebSockets one. This was already diagnosed once in Phase
1 (before backing `colyseus` back out, since it wasn't actually needed yet) — confirmed via
`pnpm why uWebSockets.js`. Fix: add `blockExoticSubdeps: false` to `pnpm-workspace.yaml` (it's a
legitimate, well-known package Colyseus itself ships; the git hosting is a licensing artifact, not
a trust signal). You may also hit `ERR_PNPM_IGNORED_BUILDS` for native build scripts
(`esbuild`, `msgpackr-extract` were the ones seen so far) — run `pnpm approve-builds <name>` for
each; both are legitimate.

## Working agreements

- **Commit directly to `main`** — the user chose this over per-phase branches at the start of
  Phase 1. Commit after each finished, tested piece.
- **Don't push** unless asked.
- Container build files are `containerfile`/`containerfile.containerignore`, not
  `Dockerfile`/`.dockerignore` — the user builds locally with `podman`. A `.dockerignore` with
  identical content to `containerfile.containerignore` also has to exist (CI's `docker buildx`
  only auto-discovers that name); keep both in sync by hand if the ignore rules change.
- Work test-first (`tdd` skill). Run `code-review` against the phase's commits before calling its
  gate passed — both times it ran in Phase 1, it found real, worth-fixing issues.
- When you build or touch a containerfile, **actually build and run it with `podman`** — don't
  stop at a dry-run. Phase 1's dry-run (simulating `turbo prune`/`pnpm deploy` by hand) missed
  three real bugs that only surfaced running `podman build`/`podman run` for real: a
  `tsconfig.base.json` copy needed in both containerfiles (not just the one it was first added
  to), short-image-name resolution failing under this machine's `short-name-mode = "enforcing"`
  podman config, and an `nginx-unprivileged` permission error writing `config.js` (the base
  image's html directory isn't group-writable, only its `COPY --chown`'d contents are).

## Suggested skills

- **`tdd`**: primary workflow for `shared/schema`, `shared/protocol`, `MatchRoom`, `GameClient`,
  `playersToRects`.
- **`code-review`**: review Phase 2's commits since Phase 1's last commit before calling its gate
  passed.
- **`run`**: Phase 2's gate is two browser tabs seeing each other's rectangles through the compose
  stack — use this to actually launch and check it, not just pass unit tests.
- **`research`**: only if something Phase 2 needs isn't already covered in
  `docs/research/phase1-version-assumptions.md` (e.g. `@colyseus/monitor`, Express version specifics,
  or anything about `TickDriver`/`setSimulationInterval` beyond what's already confirmed there).

## Suggested commit granularity for Phase 2

Roughly following the plan's implementation steps:

1. `shared/schema` (`PlayerState`, `MatchState`) + `shared/protocol` (`MessageType`, payload guards).
2. `apps/server`: add `colyseus`/`@colyseus/schema`/`@colyseus/testing` as real dependencies
   (handle the `blockExoticSubdeps`/build-approval gotchas above first), then `index.ts`
   (`defineServer` + `/healthz`/`/readyz`), `rooms/MatchRoom.ts`, and the injected `TickDriver`.
3. `apps/client`: `game/GameClient.ts`, `game/viewmodel/playersToRects.ts`, `routes/play.tsx`.
4. Local stack (`compose.yaml` or whatever you and the user settle on) + any CI wiring
   (`ci.yml`'s new `browser` job, `docker.yml`'s new `smoke` job).

At the end: run `code-review` against everything since Phase 1's last commit, fix what it finds,
then report to the user what was built, the test results, and what's blocked (podman-compose not
being installed is the known one going in).
