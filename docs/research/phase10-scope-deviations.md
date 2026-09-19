# Phase 10 (Production Hardening and Deployment): scope and findings

Written 2026-09-19. Same purpose as `phase8-scope-deviations.md`: record what the plan's Phase 10
prose asked for that this pass did not build, and the facts checked against installed packages.

## Scope decision (made with the user, not assumed)

Phase 10 mixes pure code with real infrastructure. The plan itself lists "hosting target" as an
open decision to resolve *before* this phase (Appendix B, item 4), and no cloud accounts, registry
credentials, or deploy secrets exist in this repo. The user chose **code + tests only; defer deploy
infra**.

### Built (and verified live where noted)

- **Structured logs** — `apps/server/src/logger.ts` (pino, `roomId`/`matchId` child logger in
  `MatchRoom`; silent under Vitest unless `LOG_LEVEL` is set).
- **`/metrics`** — `observability/metrics.ts` (prom-client): CCU, rooms by phase, tick-duration
  histogram, input drops, `recordMatch` failures. Verified live under a 24-bot load: 4 rooms, 4358
  ticks, **100% under 4 ms** (plan budget: p95 < 8 ms).
- **Graceful shutdown** — `shutdown.ts` + `MatchRoom.onBeforeShutdown`; `/readyz` 503 while draining;
  new rooms rejected while draining; `DRAIN_TIMEOUT_MS` (default 10 min). Verified live: SIGTERM
  mid-match gave `/readyz` 503, `/healthz` 200, process stayed up, then exited 0 at the timeout.
- **Guardrails** — per-process room cap (`MAX_ROOMS_PER_PROCESS`), per-IP upgrade limit
  (`beforeUpgrade`, `MAX_UPGRADES_PER_IP_PER_MINUTE`), per-user join limit, 4 KiB `maxPayload`, and
  an input-abuse kick after 30 consecutive rate-limited messages.
- **Client** — nginx CSP (`connect-src` limited to the game + Supabase origins, rendered at container
  start by `entrypoint.sh`), `no-cache` for `index.html`/`config.js`, immutable hashed assets.
  Verified in a real podman container and a real browser: the app renders under the CSP and a fetch
  to an unlisted origin is blocked.
- **Load test** — `apps/server/loadtest/bots.ts` (`pnpm --filter server run loadtest`).
- Tests: `shutdown.test.ts`, `observability/metrics.test.ts`, `rateLimit.test.ts`,
  `MatchRoom.abuse.test.ts`, `MatchRoom.shutdown.test.ts`, `client/docker/entrypoint.test.sh`
  (a plain sh script — bats isn't installed; chained into the client's `test` script).

### Deferred (needs decisions or credentials only the user has)

- `docker.yml` multi-arch builds, `provenance`/`sbom`, Trivy gating; `deploy.yml`
  (staging → production → rollback) with GitHub environments and secrets; release-please/Changesets;
  the `deploy smoke` script; hosting docs and the concrete deploy step. All blocked on the hosting
  target and secrets.
- `@colyseus/redis-presence`/`redis-driver` and `publicAddress`: the plan says to start
  single-process; left off.
- Error reporting (Sentry) — optional in the plan, needs a DSN.
- The `e2e`/`smoke` CI jobs still lack real Supabase (Phase 8's open gap, untouched).

### Known limitations (found in review, not fixed)

- The per-IP limit runs in the WebSocket `beforeUpgrade` hook only. Colyseus's HTTP matchmake
  request (which reserves seats and can create rooms) is not separately rate-limited; the room cap
  is its only bound. Not verified against the installed `ws-transport` whether a hook exists there.
- `context.ip` honours whatever proxy-header handling Colyseus does; behind a reverse proxy, confirm
  it can't be spoofed via `X-Forwarded-For` before trusting the per-IP limit.
- Drain: clients can still join non-full *running* rooms while draining (only room *creation* is
  blocked, matching the plan's "stops accepting new rooms").
- The load-test budget comparison is a live-run observation in this document, not an automated gate.

## Findings from checking installed packages

1. **`patch bytes per second` is not implemented.** `Room.broadcastPatch()` returns only a boolean;
   no public API exposes encoded patch size, and calling schema `encode()` ourselves would consume the
   dirty-tracking the real patch stream depends on. The load-test harness (`@colyseus/loadtest`)
   measures bytes client-side if that number is needed.
2. **Colyseus's default graceful shutdown neither times out nor lets matches finish.**
   `Room.onBeforeShutdown()` disconnects every client immediately (observed live: SIGTERM mid-match
   exited in ~2 s), and `matchMaker.gracefullyShutdown()` waits for room disposal with no timeout.
   Hence `gracefullyShutdown: false` in `defineServer` plus our own handler.
3. **`roomCount` is incremented after `onCreate` resolves**, so the capacity check is `>=`, not `>`.
4. **`prom-client@15.1.3` is deprecated but still npm's `latest`**; the announced successor
   `@prometheus-io/client` is `0.16.x`. Kept `prom-client`, per the plan.
5. **CSP needs `script-src 'unsafe-inline'`.** React Router's SPA-mode `index.html` inlines its
   hydration scripts; the nginx image has no tooling to hash them at container start. `connect-src`
   (the plan's stated requirement) is strict.
6. **The load test found a real bug:** `MatchRoom` never set `maxClients`, so quick play put all 24
   bots into one 24-player room. Fixed (`maxClients = MAX_PLAYERS`) and covered by a test.
