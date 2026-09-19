# Phase 8 auth/persistence: scope deviations from the plan's prose

`docs/IMPLEMENTATION_PLAN.md`'s "Phase 8 — Auth and Persistent State (Supabase)"
section describes a larger surface than this session fully wired end-to-end.
Everything below was a deliberate call, in the same spirit as earlier phases'
deviation notes (`docs/research/phase6-arena-scope-deviations.md`,
`phase5-e2e-ci-deviations.md`) — either the plan's own prose leaves room for
it, or the full version needs infrastructure/verification this session
couldn't finish responsibly. None of these are silent.

## Implemented and verified live, not just unit-tested

- The full schema (`profiles`, `player_loadouts`, `player_unlocks`, `matches`,
  `match_participants`, `player_stats`, the `leaderboard` view,
  `record_match_result()`), applied via `supabase db reset` against a real
  local Postgres — `supabase start` really does work on this podman-only
  machine (see `docs/research/phase8-supabase-cli-podman.md`; verdict:
  genuine, actively-maintained podman fallback in the CLI, not a workaround).
- Both pgTAP suites (`supabase/tests/rls.test.sql`,
  `record_match_result.test.sql`) pass via `pnpm exec supabase test db`.
- `verifyToken.ts`, `PlayerRepository` (both implementations, including
  `SupabasePlayerRepository`'s contract suite against the real local
  instance), and `MatchRoom`'s auth/persistence wiring all have passing
  automated tests.
- **A real end-to-end join**, live: `apps/server`'s server started against
  the actual local Supabase instance, a script signed in anonymously via
  GoTrue's REST API (the same call `supabase-js`'s `signInAnonymously()`
  makes), and `apps/server/scripts/smoke-join.ts` joined `MatchRoom` with
  that real JWT — accepted. A join with no token was rejected
  (`missing auth token`). The anonymous sign-in's `on_auth_user_created`
  trigger created a real `profiles` row, confirmed by querying the database
  directly. This is the strongest evidence this phase's server-side gate is
  real: not mocked JWTs, not a stubbed verifier, the actual Supabase auth
  service and the actual `jose`/JWKS verification path.

## Deliberately not implemented (or not verified) this session

1. **`compose.yaml`/`containers.yaml`'s `smoke` job don't run a real Supabase
   instance alongside the server/client containers.** `MatchRoom.onAuth` now
   rejects every join without a valid token, so:
   - `compose.yaml`'s `server` service gets the same kind of placeholder
     `SUPABASE_URL`/`SUPABASE_SECRET_KEY` the `client` service has carried
     since an earlier phase — the server starts and its `/healthz`/`/readyz`
     still respond, but a real join will fail (correctly) until real values
     are supplied.
   - `containers.yaml`'s `smoke` job (gates image publishing to GHCR) has
     **not** been updated to start Supabase, obtain a real token, or pass it
     to `smoke-join.ts`. `smoke-join.ts` itself now requires
     `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` and will fail loudly if
     they're unset — meaning **this job will fail as committed**, blocking
     `push` (which is gated on `smoke` passing) until it's fixed.
   - Why not just fixed here: doing this properly needs the server
     container (on `cc-net`) to reach a Supabase instance's containers
     (their own podman network, published on host ports) — the same
     `127.0.0.1`-inside-a-container trap CLAUDE.md already documents for
     nginx/wget elsewhere, likely needing `host.containers.internal` or a
     shared network, neither tried here. This is a real, scoped follow-up
     task, not a hard blocker on Phase 8's own gate (which is about a signed-
     in player finishing a match and their stats persisting — verified live
     against the dev server, not the container images).
2. **`.github/workflows/integration.yaml` is new and untested in real GitHub
   Actions** (this session has no CI runner access) — every step it runs
   (`supabase start`, `db reset`, `db lint`, `test db`, the Supabase contract
   suite, the types-freshness check) was verified by hand, in this exact
   sequence, against this session's local instance, so the commands
   themselves are proven; only the GitHub Actions environment specifics
   (Ubuntu's Docker, `jq` availability, action versions) are unverified.
   `e2e.yaml` (the plan's "specs sign in as anonymous users") was not touched
   at all — Phase 8 didn't reach e2e Playwright coverage this session.
3. **No real OAuth provider (Discord/Google) was exercised** — `signInWithOAuth`
   calls the real `supabase-js` API correctly, but testing it live needs a
   configured OAuth app + redirect URI, which isn't set up for this local
   instance's `config.toml`. Magic-link and anonymous sign-in were both
   verified live (anonymous via the direct API call above; magic-link's
   `signInWithOtp` call itself wasn't hand-triggered against a running
   client + Mailpit inbox in a browser this session — see the live-
   verification report for exactly what was and wasn't clicked through).
4. **Account linking (guest → permanent) was not exercised end-to-end.**
   Supabase's documented behavior (calling `signInWithOtp`/`updateUser` while
   signed in anonymously links the email to the same user id rather than
   creating a new one) is why `player_stats` surviving an upgrade needs no
   extra code on this repo's side — but that specific linking flow wasn't
   clicked through live this session.
5. **`helmet_id`/`cape_id`/`weapon_style_id` are persisted and RLS-validated
   but never read or rendered anywhere** — `MatchRoom.onJoin` only applies
   `loadout.weapon` (the one field with an existing gameplay effect); the
   cosmetic fields have no rendering pipeline until Phase 9 ("Customization
   and Stats UI"). Documented at the call site in `MatchRoom.ts` too.
6. **`/loadout` and `/stats` are real, `clientLoader`-guarded routes with
   placeholder content**, not the actual customization/leaderboard UI — the
   plan names them only as guarded routes in Phase 8's step 6; their content
   is explicitly Phase 9's job.
7. **CI secrets for staging/production (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
   etc., in GitHub Environments) were not touched** — the plan itself says
   these are Phase 10's concern, not Phase 8's.
