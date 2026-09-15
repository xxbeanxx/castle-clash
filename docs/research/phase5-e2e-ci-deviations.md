# Phase 5 e2e CI: deviations from the plan's prose

`docs/IMPLEMENTATION_PLAN.md`'s Phase 5 "CI/CD integration" section describes
`.github/workflows/e2e.yml` as building images, running `docker compose up -d
--wait`, and running Playwright "in the `mcr.microsoft.com/playwright`
container." Two of those three assumptions don't hold in this repo, for
reasons already established (not re-derived here) by Phase 1/`containers.yaml`
research and CLAUDE.md's own "Local stack" section:

1. **No `docker compose` / `podman-compose`.** Confirmed unavailable on this
   project's dev machine, and `containers.yaml`'s `smoke` job already hit the
   identical gap and solved it by building both images with `podman build`
   and starting them with two `podman run` invocations that mirror
   `compose.yaml`'s ports/env by hand. `e2e.yml` reuses that exact,
   already-proven pattern rather than introducing a new one — see
   `containers.yaml`'s `smoke` job for the healthcheck/wait-loop this was
   copied from.
2. **No `mcr.microsoft.com/playwright` container job.** `ci.yaml`'s existing
   `browser` job already runs Playwright-driven browser tests (Vitest browser
   mode, not `@playwright/test`, but the same underlying `playwright` package)
   directly on `ubuntu-latest` with `playwright install --with-deps chromium`,
   cached by Playwright version. `e2e.yml` reuses that pattern instead of a
   separate container image, for the same reason as (1): match what this repo
   has already gotten working rather than adding an unverified alternative.

One new piece the plan does call out and this phase actually adds:
`apps/client/containerfile` takes a `VITE_E2E` build arg (default empty,
so a normal image never sets it), threaded to `ENV VITE_E2E=${VITE_E2E}`
before the client's `turbo build` step — Vite bakes `import.meta.env.VITE_*`
at build time, so this is a build-time flag, not a runtime `config.js` one
(contrast with `GAME_SERVER_URL`/`SUPABASE_*`, which are runtime). Only this
flavor of the client image compiles in `apps/client/app/game/debug.ts`'s
`window.__CC_DEBUG__` hook, which `e2e/private-match.spec.ts` reads to assert
real predicted movement happened — `e2e.yml` builds it as
`castle-clash-client:e2e`, tagged separately from the plain
`castle-clash-client:local` `containers.yaml` builds and publishes.

**Not yet verified live**: this workflow has not been run in real GitHub
Actions from this session (no way to do that here) — it's written to the
best of the same knowledge `containers.yaml`/`ci.yaml`'s already-working jobs
encode, but treat it the same as any other untested-in-CI file until a real
run confirms it. `pnpm --filter @castle-clash/e2e run test:e2e` (against a
real running client + server, `CLIENT_URL` pointed at the client) is the way
to exercise `private-match.spec.ts` directly without CI.
