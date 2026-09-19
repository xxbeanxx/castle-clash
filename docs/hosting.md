# Hosting and releases

castle-clash runs on **Azure Container Apps** (Canada Central), one resource group per environment,
images from GHCR, database and auth on Supabase. This is the runbook; the reasoning and the facts it
rests on are in `docs/research/phase10-deploy-decisions.md`.

```
                        ┌──────────── staging ────────────┐   ┌────────── production ──────────┐
browser ─▶ castle-clash[-staging].atomic-nucleus.com       │   │  (same shape, own RG/apps/DB)  │
   │        ca-castle-clash-client-*   nginx, static SPA   │   │                                │
   └──wss──▶ castle-clash-game[-staging].atomic-nucleus.com│   │                                │
            ca-castle-clash-server-*   Colyseus, 1 replica │   │                                │
                          │                                │   │                                │
                          └──▶ Supabase project (per env) ─┘   └────────────────────────────────┘
```

**Provisioned 2026-09-19: production only** (one free Supabase project; staging is supported by the
scripts and workflows but was not created). Everything below marked _staging_ is optional.

| Thing              | Production (exists)                                    | Staging (not created)                                  |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| Resource group     | `rg-castle-clash`                                      | `rg-castle-clash-staging`                              |
| Environment        | `cae-castle-clash` (logs: `log-castle-clash`)          | `cae-castle-clash-staging`                             |
| Apps               | `ca-castle-clash-{server,client}`                      | `ca-castle-clash-{server,client}-staging`              |
| Client URL         | `https://castle-clash.atomic-nucleus.com`              | `https://castle-clash-staging.atomic-nucleus.com`      |
| Game server URL    | `wss://castle-clash-game.atomic-nucleus.com`           | `wss://castle-clash-game-staging.atomic-nucleus.com`   |
| Server size        | 1 vCPU / 2 GiB (raise via `SERVER_CPU`/`SERVER_MEMORY`) | 1 vCPU / 2 GiB                                         |
| Supabase           | `castle-clash` (`vrcxprhmonzpuelfnijy`, free plan, ca-central-1) | —                                             |
| Deploy identity    | app registration `castle-clash-deploy-prod`, role `Container Apps Contributor` on `rg-castle-clash` only | — |
| GitHub environment | `production` (required reviewer, `main` only)          | `staging` (no gate)                                    |

The production Container Apps still run Microsoft's placeholder image until the first release deploys.
Free-tier Supabase projects **pause after a week of inactivity**; a paused project fails the deploy's
`db push` until it is restored from the dashboard.

## The release flow

```
conventional commits on main
        │
        ▼
release.yaml ── release-please keeps a "release PR" open (version + CHANGELOG)
        │        merging it creates the vX.Y.Z tag + GitHub release, and in the same run:
        ▼
docker.yml ──── build server+client for linux/amd64,arm64 with provenance + SBOM, push as sha-<short>,
        │        Trivy fails the job on any fixable CRITICAL, then promotes vX.Y.Z and X.Y to that digest
        ▼
deploy.yml ──── resolves each tag to its digest, then:
   staging  ──  db push → deploy server → wait for /healthz == version → deploy client → deploy smoke
   production   the same, after the required reviewer approves; if it fails the apps revert to
                the images they were running before, the database is left alone
```

**Required checks are not enforced by these workflows.** The plan says the `verify`, `browser`,
`integration`, `e2e`, `docker` and `smoke` checks must pass before tagging. `release.yaml` runs on the
push to `main` in parallel with CI, so that gate has to live in **branch protection on `main`**
(require those checks on PRs, including the release PR — which needs `RELEASE_PLEASE_TOKEN`, below).
Note `e2e` and the `containers.yaml` smoke currently cannot pass (Phase 8's missing-Supabase gap).

Release tags are immutable: `docker.yml` refuses to move an existing `vX.Y.Z` to a different image.
If a release build must be redone, delete that version of the two GHCR packages first. Tags are
promoted only after **both** images pass the Trivy scan.

`docker.yml` is called by `release.yaml` rather than triggered by the tag push: release-please tags
with the built-in `GITHUB_TOKEN`, and events raised by that token start no workflows. (The plan's
"`docker.yml` on `v*` tags" is met by the same run.) A tag pushed by hand builds nothing: use
**Actions → docker → Run workflow** with the tag, then **Actions → deploy**.

Release PRs are also opened with `GITHUB_TOKEN`, so CI checks do not run on them. If those checks are
required by branch protection, create a personal access token (`repo` scope on this repo only) and
store it as the repo secret `RELEASE_PLEASE_TOKEN`; `release.yaml` uses it when present.

### Manual deploy and rollback

Actions → **deploy** → Run workflow:

| Goal                     | version  | rollback | target       |
| ------------------------ | -------- | -------- | ------------ |
| Deploy a release         | `v1.2.3` | off      | `production` (default) |
| Staging first, then prod | `v1.2.3` | off      | `both` (needs the optional staging environment) |
| **Roll production back** | `v1.2.2` | **on**   | `production` |

Rollback redeploys an older tag by digest **without** `supabase db push` (the database is already
ahead of the older tag's migration folder, which `db push` rejects). It still needs the `production`
reviewer's approval and still runs the deploy smoke. **The database is never rolled back
automatically** — see the migration rules below.

## Migrations: expand / contract

`supabase db push` runs _before_ the new server is deployed, and the old server keeps running against
the migrated schema for the duration of the rollout and after any rollback. So every migration must
work for **both** the previous and the new release:

1. **Expand** (release N): add nullable columns / new tables / new functions, keep old ones working.
2. **Migrate/ship** (release N): the code starts using the new shape.
3. **Contract** (release N+1 or later): drop the old column/function, only once no deployed release reads it.

Never rename or drop something in the same release that stops using it, and never make an existing
column `NOT NULL` without a default. `20260919120000_smoke_matches_skip_stats.sql` is an example of
a safe change: a body-only `create or replace` that behaves identically for every non-smoke payload.

## What deploys, and how it drains

Both apps run in **single-revision mode**. A deploy is `az containerapp update --image <repo>@sha256:…`,
which creates a new revision; when it is up, traffic moves and the old revision gets `SIGTERM`. The
server turns that into a drain (`shutdown.ts`): `/readyz` answers 503, no new rooms are created,
running matches finish, and it exits after at most `DRAIN_TIMEOUT_MS` (540 s here). Container Apps
sends `SIGKILL` after the termination grace period (default 30 s), so the deploy raises it to 600 s
(`--termination-grace-period 600`) to let the drain finish. **Unverified:** Microsoft's docs I could
reach state the 30 s default but not a maximum; 600 is from memory. If Azure rejects it the first
deploy fails loudly at that step — lower `--termination-grace-period` and `DRAIN_TIMEOUT_MS` together.

The server is deliberately **one replica** (`min=max=1`): rooms live in process memory and there is
no Redis presence/driver, so a second replica could not see the first's rooms. Scale it vertically
(`SERVER_CPU`/`SERVER_MEMORY` environment variables), not horizontally, until `@colyseus/redis-presence`
and `publicAddress` are added (the plan's "only when more than one process is needed").

Ingress: HTTP ingress supports WebSockets out of the box (documented request timeout: 240 s; Colyseus
pings every 3 s by default — `WebSocketTransport`'s `pingInterval`). Container Apps runs only `linux/amd64` images — the release build is
multi-arch, and Azure pulls the amd64 variant. Clients already connected to a draining server stay connected until
their match ends or the drain timeout, but a *reconnect* — or a join by private-room code — after
traffic has moved lands on the new revision, which has no such room. An accepted limitation of the
single-process design.

## One-time setup

**Done for production on 2026-09-19** (steps 1-4: the Supabase project with anonymous sign-ins and
auth URLs, the Azure resources and deploy identity, the GitHub `production` environment, the runtime
secrets, and all migrations applied). Still open: step 5 (GHCR package visibility, after the first
release). Steps 1-4 and 6 are now Terraform (`infra/terraform/`): the Azure and GitHub parts were
adopted from what was created by hand, and every secret is generated by Terraform rather than typed in.

Prerequisites: an authenticated `az` (rights to create resource groups, role assignments and app
registrations, and to edit the `atomic-nucleus.com` DNS zone), `gh`, `terraform`, a Supabase access
token (`SUPABASE_ACCESS_TOKEN`), and `supabase` (`npx supabase`, for migrations).
`infra/terraform/README.md` covers the state backend and how to run it.

1. **Supabase project** — `supabase.tf` owns it (region, database password, the server's secret API
   key). It was adopted with `terraform import`; a new project would be created by `apply`. Auth
   settings are *not* in Terraform: in the dashboard, **enable anonymous sign-ins** (the game signs
   guests in anonymously and `MatchRoom.onAuth` rejects everyone else) and set the site URL and
   redirect allow-list to the client origin. The local stack's `supabase/config.toml` is not pushed to hosted
   projects. GitHub-hosted runners are IPv4-only and the direct `db.<ref>.supabase.co` host is
   IPv6-only, so `SUPABASE_DB_URL` is built from the **session-mode pooler** host (`…pooler.supabase.com:5432`).
2. **Azure and GitHub, by Terraform** — `terraform -chdir=infra/terraform apply` (with `GITHUB_TOKEN`
   and `SUPABASE_ACCESS_TOKEN` set). Creates the resource group, Container Apps environment, both
   apps on a placeholder image, DNS records and managed certificates for the two hostnames, the deploy
   identity federated to the GitHub `production` environment (no client secret), and, in GitHub, the
   environment itself (required reviewer; deployments restricted to `main`, because the Azure
   credential trusts the environment name alone), its variables and secrets, and the repository
   settings and `main` ruleset. See `infra/terraform/README.md` for what Terraform leaves to the
   deploy workflow.
3. **Secrets** — nothing to do by hand. Terraform generates the smoke token and the database
   password, mints the server's Supabase secret key, and writes each to every place that uses it
   (GitHub `production` environment secrets, the server Container App's secrets).
   `terraform output -raw smoke_token` (or `supabase_secret_key`, `supabase_db_url`) reads one back;
   rotate with `terraform apply -replace=random_password.smoke_token` (or `-replace=supabase_apikey.server`).
4. **Migrations** — `supabase db push` against the hosted project runs in the deploy workflow using
   `SUPABASE_DB_URL`; the first one can be run by hand with the same URI.
5. **GHCR visibility** — after the first release builds, set both packages
   (`castle-clash-server`, `castle-clash-client`) to **public** (package settings → Change
   visibility; there is no API for it), so Container Apps can pull without registry credentials. The
   deploy fails with an image-pull error until then.
6. **Repository settings** — Terraform (`github_workflow_repository_permissions`) lets GitHub
   Actions create pull requests, which release-please needs.

### GitHub environment reference

| Kind     | Name                                                                                                                              | Set by                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| secret   | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`                                                                     | Terraform (`github.tf`)           |
| secret   | `SUPABASE_DB_URL`                                                                                                                 | Terraform (`github.tf`)           |
| secret   | `SMOKE_TOKEN`                                                                                                                     | Terraform (`github.tf`)           |
| variable | `AZURE_RESOURCE_GROUP`, `SERVER_APP`, `CLIENT_APP`, `GAME_SERVER_URL`, `CLIENT_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`    | Terraform (`github.tf`)           |
| variable | `SERVER_CPU`, `SERVER_MEMORY`, `CLIENT_MIN_REPLICAS` (optional overrides)                                                          | Terraform (`github.tf`)           |
| repo     | `RELEASE_PLEASE_TOKEN` (optional PAT so release PRs run CI)                                                                        | you                               |

Container App secrets (server only): `supabase-secret-key`, `smoke-token`.

## The deploy smoke

`pnpm --filter @castle-clash/server run deploy-smoke` (run by `deploy-environment.yml` after each
rollout; usable by hand against any environment). Environment: `GAME_SERVER_URL`, `CLIENT_URL`,
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SMOKE_TOKEN`, optional `EXPECTED_VERSION`. It checks, in
order: server `/healthz` (and that it reports the version just deployed), `/readyz`, that the client
loads and its `config.js` names this game server, an anonymous sign-in, a private room joined and left
by a headless client, and a **smoke match write**.

The match write is `POST /smoke/record-match` — a route that only exists when the server has a
`SMOKE_TOKEN`, and needs it (constant-time compared) plus a valid Supabase user JWT. It records a
`mode = 'smoke'` match through the normal `record_match_result()` path; that function stores the match
and participant rows but never touches `player_stats`, so a smoke match cannot appear on the
leaderboard. If `SMOKE_TOKEN` is set but Supabase is not configured the route is **not registered**
(the smoke then fails with a 404) rather than falling back to the in-memory repository, which would
"record" the match without touching the database. The check proves the write path by the RPC
succeeding; it does not read the row back.

Every run also creates one anonymous Supabase user and one `matches` row. Prune with
`delete from matches where mode = 'smoke'` (participant rows cascade) and, if wanted, delete
anonymous users with no `player_stats` row from the Auth dashboard.

## Operating notes

- **Logs**: pino JSON to stdout → the environment's Log Analytics workspace (`ContainerAppConsoleLogs_CL`).
- **Metrics**: `/metrics` (Prometheus text) is served on the public game hostname. It exposes no
  player data, but if that is unwanted, block the path at the ingress or add an IP restriction.
- **Per-IP rate limit** (`MAX_UPGRADES_PER_IP_PER_MINUTE`) keys on Colyseus's `context.ip`, which takes
  the _first_ hop of `x-real-ip` / `x-forwarded-for`, but Azure's ingress _appends_ to a client-supplied
  `X-Forwarded-For` and documents that only the rightmost address is trustworthy. So a client can send
  its own first value and dodge the limit: treat it as a soft guard, not an abuse boundary (the room
  cap and per-user limits are the hard ones). A real fix is to key on the rightmost hop.
- **Cost**: the server's replica is always on (`min=1`); the client scales to zero in staging.
  Consumption-only environments cap an app at 2 vCPU / 4 GiB, which is what production uses.
- **Probes**: none are configured by this pipeline. Microsoft documents default TCP probes on the
  ingress port as added by the _portal_; whether an app created through the CLI gets them was not
  verified. HTTP probes on `/healthz` (liveness) and `/readyz` (readiness) are a worthwhile follow-up,
  but Container Apps can only set probes via YAML (`az containerapp update --yaml`), whose merge
  behaviour for secrets this pipeline deliberately avoided depending on without a live test.
