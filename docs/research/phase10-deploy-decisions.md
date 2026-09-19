# Phase 10 deploy pipeline: decisions, verified facts, and what is still unproven

Written 2026-09-19. Completes the half of Phase 10 that `phase10-scope-deviations.md` deferred. The
runbook is `docs/hosting.md`; this records _why_ and _what was actually checked_.

## Decisions (made with the user)

- **Hosting target (Appendix B item 4): Azure Container Apps**, modelled on the user's `apex-gains`
  repo (OIDC `azure/login`, `az containerapp update --image`, GHCR images, custom domain on
  `atomic-nucleus.com` with a managed certificate). Azure, Supabase and GCP CLIs were authenticated
  locally; no secrets existed anywhere.
- **Two environments, separate blast radius**: own resource group, Container Apps environment, deploy
  identity and Supabase project each. The staging identity has `Container Apps Contributor` on the
  staging resource group only.
- **Single server replica** (`min=max=1`, scale vertically): no Redis presence/driver, so rooms are
  process-local. `publicAddress`/redis stay deferred, as the plan says.

## Deviations from the plan's Phase 10 text

| Plan                                     | Built                                                                                                                                                 | Why                                                                                                                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker.yml` on `v*` tags                | `docker.yml` is `workflow_call` + `workflow_dispatch`, called by `release.yaml`                                                                       | release-please tags with `GITHUB_TOKEN`; events from that token start no workflows (release-please-action README). A tag-push trigger would never fire, or double-build with a PAT. |
| `deploy.yml` on `workflow_run`           | Chained with `uses:` from `release.yaml`; also `workflow_dispatch`                                                                                    | Same reason; also avoids `workflow_run`'s default-branch-only semantics.                                                                                                              |
| Trivy scan after the build               | Push only `sha-<short>`, scan that digest, then `imagetools create` the `vX.Y.Z` / `X.Y` tags                                                        | A vulnerable image never carries a tag anything deploys from. Scans the amd64 variant only (Trivy resolves the runner platform).                                                      |
| Trivy fails on CRITICAL                  | Fails on CRITICAL with `ignore-unfixed: true`                                                                                                         | A CVE with no available fix cannot be acted on and would block every release. Drop the flag to be stricter.                                                                            |
| Deploy "by digest"                       | `deploy.yml` resolves the tag to a digest at run start (`imagetools inspect`), passes `repo@sha256:…`                                                 | Works identically for the chained and manual paths; the digests are also in the job summary.                                                                                          |
| `rollback` job                           | `deploy.yml` with `rollback=true` (no `db push`) for an older tag, plus an automatic app-only revert when a production deploy fails                   | `db push` refuses a remote schema ahead of the checked-out migrations, so a rollback must skip it.                                                                                    |
| Sentry                                   | Not built                                                                                                                                             | Optional in the plan; needs a DSN and a decision on a vendor.                                                                                                                         |
| `deploy smoke`: "match write"            | `POST /smoke/record-match` on the server, gated by `SMOKE_TOKEN`                                                                                      | A real match needs two fighting players. The route drives the real write path (server → repository → `record_match_result()`), and only answers 200 after it resolved.                |
| Container probes on `/healthz`/`/readyz` | Not configured                                                                                                                                        | Only settable via YAML; see "Unproven" below.                                                                                                                                         |

## Facts checked against live sources

- **GitHub OIDC subject is the immutable form** here:
  `gh api repos/xxbeanxx/castle-clash/actions/oidc/customization/sub` →
  `use_immutable_subject: true`, prefix `repo:xxbeanxx@997639/castle-clash@1370518775`. The federated
  credential subject is `<prefix>:environment:<name>`. The reference repo's credential uses the same
  scheme (`repo:xxbeanxx@997639/apex-gains@1354145381:ref:refs/heads/main`). `provision.sh` reads the
  prefix from the API rather than assuming the classic `repo:owner/name` form.
- **Action versions (latest releases, 2026-09-19)**: release-please-action v5.0.0 (Node 24; its README
  examples still say v4), trivy-action v0.36.0, docker/build-push-action v7.4.0, setup-buildx v4.4.1,
  setup-qemu v4.4.0, login-action v4.6.0, azure/login v3.1.0, supabase/setup-cli v3.0.0. actionlint
  (with shellcheck) reports 0 findings across all 8 workflows; shellcheck is clean on the 3 scripts.
- **release-please with `GITHUB_TOKEN`**: its PRs and tags trigger no workflows (README, "Other Actions
  on Release Please PRs"). Hence the chain in `release.yaml` and the optional `RELEASE_PLEASE_TOKEN`.
- **Azure Container Apps** (learn.microsoft.com, fetched today): supports only `linux/amd64` images;
  Consumption-only environments cap an app at 2 vCPU / 4 GiB; HTTP ingress supports WebSockets, request
  timeout 240 s; `SIGTERM` then `SIGKILL` after 30 s by default; single-revision mode shifts traffic
  automatically once the readiness probe succeeds; `X-Forwarded-For` is appended to, and only the
  rightmost address is trustworthy.
- **`az` 2.83.0**: `containerapp update` has `--image`, `--revision-suffix`, `--termination-grace-period`
  (default 30), `--set-env-vars`, `--min-replicas`, `--max-replicas`; `containerapp secret set` names are
  capped at 20 characters; `hostname add|bind`, `env certificate create` exist.
- **`supabase db push`** takes `--db-url` (must be percent-encoded) and updates Vault secrets from
  `config.toml` unless `--skip-vault` — the workflow passes `--skip-vault`.
- **Colyseus client IP**: `resolveClientIp` (`@colyseus/core` `Transport.mjs`) returns the _first_ hop of
  `x-real-ip`, then `x-forwarded-for`, then `x-client-ip`. Combined with Azure's append behaviour this
  makes the per-IP upgrade limit spoofable (closes the "confirm it can't be spoofed" item in
  `phase10-scope-deviations.md`: it can).

## Verified live locally

Local Supabase + a real server process (`SMOKE_TOKEN`, `SERVER_VERSION=9.9.9`) + a stand-in static
client: `deploy-smoke` passed all 7 checks; with `EXPECTED_VERSION=1.0.0` it failed at `/healthz` and
named the mismatch. The resulting `matches` row had `mode=smoke`, `server_version=9.9.9`, and
`player_stats` stayed empty. `supabase test db`: 26 tests pass, including the new
`record_match_result_smoke.test.sql`.

## Code-review outcome (Standards + Spec sub-agents)

Fixed after review: the smoke route could false-pass on the in-memory repository fallback (now not
registered without Supabase); environments accepted deployments from any branch (now restricted to
`main`); digests from `docker.yml` were never passed to `deploy.yml`, which re-resolved a movable tag
(now chained, with tags promoted only after *both* scans pass and never moved once set); a
workflow-level concurrency group would have blocked later releases behind a pending production
approval (now on the release-please job only); dependencies were installed with an Azure session live
(now before login); the three infra scripts each copied the environment mapping (now `infra/lib/env.sh`).
Documented rather than built: required-checks-before-tagging must be branch protection; the smoke does
not read the `matches` row back; smoke users/rows accumulate; rollback goes through the production
reviewer gate; actions are pinned by tag, not SHA, and `supabase/setup-cli` is `latest`; no nightly
Trivy re-scan (plan's nightly workflow) was added.

## Unproven (nothing here has run on GitHub or Azure)

1. **No workflow has executed.** Workflow files cannot be dispatched before they exist on the default
   branch, and pushing was not requested. Expect first-run fixes (most likely: action inputs, the
   `secrets`/`vars` reaching a reusable workflow's `environment:` job, GHCR package visibility).
2. **The Azure provisioning script was not run.** The session's auto-mode classifier blocked executing
   it (it creates cloud resources, DNS records and an app registration). It is shellchecked and its
   read-only queries were exercised against the existing `apex-gains` resources (the environment
   property path for the domain-verification id; the DNS zone and record names), but the create paths
   have never run.
3. **`--termination-grace-period 600`** — the 600 s ceiling is from memory (docs reached state only the
   30 s default).
4. **Container App probes** — CLI-created apps may or may not get the portal's default TCP probes.
5. **Supabase hosted projects do not exist yet.** Creating two needs a plan decision: the
   `GjB Technologies` org already has one project (Apex Gains) and the `And-U` org has two; free plans
   allow two active projects per org. Anonymous sign-ins must be enabled on each by hand or via the
   Management API.
6. **Phase 8's CI gap is unchanged**: `containers.yaml`'s `smoke` job and `e2e.yml` still start the
   stack with no Supabase, and `smoke-join`/`deploy-smoke` both need one. The fix is the same for both:
   `supabase/setup-cli` + `supabase start` in the job (as `integration.yml` does), then pass
   `SUPABASE_URL` / the publishable and secret keys to the server container over a network it can reach
   (`--network host` or `host.containers.internal`). Left for a deliberate change with a CI run to test it.
