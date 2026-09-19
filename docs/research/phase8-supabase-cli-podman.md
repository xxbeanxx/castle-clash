# Phase 8 Supabase CLI vs Podman Check

Research date: 2026-09-16. Scope: before starting Phase 8 (Auth and Persistent State), determine
whether `supabase start`'s local dev stack is viable on this dev machine — podman 5.8.4 (rootless,
SELinux enforcing), no `docker` binary, no `docker compose`/`podman-compose` — per this repo's
established practice (`phase2`/`phase3` research docs) of verifying tooling claims against live,
current primary sources rather than trusting general knowledge or the plan's prose.

## Verdict up front

**`supabase start` is viable in this environment today**, via genuine, actively-maintained Podman
support — not a `DOCKER_HOST` socket trick or a `podman-docker` shim. The currently-shipped CLI
(`supabase@2.117.0`, npm `latest`) talks to containers by spawning a subprocess: it tries `docker`
first and **falls back to `podman` automatically** if `docker` isn't on `PATH`, verb by verb, with
no Docker Compose involved at all. This is read directly from the CLI's own TypeScript source
(§1), not inferred. Recent (June–September 2026) point releases have also been actively closing
Fedora + rootless-Podman + SELinux-enforcing bugs — exactly this machine's profile (§4) — so this
isn't a hopeful guess, it's the specific configuration the maintainers have been testing against.

**One known, dated gap**: a custom-auth-email-template SELinux fix (#6543, merged 2026-09-09)
landed *after* stable 2.117.0 branched (2026-09-07), so it's only in the `beta` npm dist-tag today.
It only matters if Phase 8 configures `auth.email.template.*` in `supabase/config.toml` for local
dev — avoidable, or fixable by pointing the devDependency at the `beta` tag if needed later.

**Recommendation**: install `supabase` as an exact-pinned pnpm devDependency (`2.117.0`, not a
caret range — same rationale CLAUDE.md already applies to `oxfmt`), run it via `pnpm exec
supabase start`, and don't configure custom auth email templates for local dev until either a
stable release ≥ the one containing #6543 ships or the `beta` tag is deliberately adopted. No
fallback (raw `podman run postgres` + hand-applied migrations, `podman system service` +
`DOCKER_HOST`, or `podman-docker`) is needed for Phase 8's pgTAP/RLS and CI portions — attempt them
for real this session.

## 1. Does `supabase start` require Docker specifically, or does it support Podman?

**It supports Podman as a first-class, built-in fallback in the currently-shipped implementation.**
The supabase/cli monorepo is mid-port from a single Go binary (`apps/cli-go`, calls the Docker
Engine API via `github.com/docker/docker/client`) to a TypeScript CLI (`apps/cli`, published to npm
as `supabase`) that bundles the Go binary only as a fallback "sidecar" for not-yet-ported commands.
`start`, `stop`, `status`, and `db start` are already fully ported, per each command's own
`SIDE_EFFECTS.md` in the repo.

`apps/cli/src/commands/start/SIDE_EFFECTS.md` states outright:

> "This command talks directly to Docker via subprocess (`docker`/`podman`) to bring up the local
> dev stack sequentially, one container at a time — it does not use Docker Compose."

The actual mechanism lives in `apps/cli/src/command-internal/container-cli.ts`
(`spawnContainerCliWithRuntime` / `containerCliExitCode`), read directly from the repo:

```ts
/**
 * Container CLIs tried in order: Docker preferred, Podman as the fallback for Docker-less hosts.
 * A runtime's own exit code and stderr propagate unchanged once it starts, so callers keep
 * Docker's error semantics regardless of which runtime answered.
 */
...
export const spawnContainerCliWithRuntime = (spawner, args, options) =>
  spawner.spawn(ChildProcess.make("docker", args, options)).pipe(
    Effect.map((handle) => ({ handle, runtime: dockerRuntime })),
    Effect.catch(() =>
      spawner.spawn(ChildProcess.make("podman", args, options)).pipe(
        Effect.map((handle) => ({ handle, runtime: podmanRuntime })),
        Effect.catch(() => Effect.fail(new ContainerRuntimeNotFoundError({ ... }))),
      ),
    ),
  );
```

and its own baked-in error message treats Podman-only as an anticipated configuration, not an
afterthought:

> `"docker: command not found (podman also not found) — install Docker Desktop or Podman and
> ensure it is on PATH"`

Because `docker` isn't on `PATH` on this machine, the very first spawn attempt fails immediately
with `ENOENT` (no slow timeout) and falls through to `podman`, which **is** on `PATH` (confirmed:
`podman --version` → 5.8.4). No `DOCKER_HOST`, no socket, no compose — this is a plain subprocess
call, so `podman` just needs to be an executable the shell can find, which it already is.

The older Go implementation (`apps/cli-go/internal/utils/docker.go`, still bundled as the sidecar
for unported commands) is architecturally different — it uses `github.com/docker/cli/cli/command
.NewDockerCli()` / `github.com/docker/docker/client` (the real Docker Engine API client, which
*does* honor `DOCKER_HOST` and docker contexts against a socket) — but it also already carries
accumulated Podman-specific patches, e.g. treating `podman.ErrNetworkExists` as success and a
documented workaround for Podman's `/containers/<id>/logs?follow` endpoint never sending EOF
(`DockerRunOnceWaitWithConfig`'s doc comment: "That EOF never arrives under podman... Waiting on
`/wait` for the exit code and then reading the log once is reliable on both Docker and podman.").
So even the legacy code path was never "Docker-only, Podman unsupported" — Podman compatibility has
been a live, if quiet, target across both implementations.

**Sources** (all read directly from `github.com/supabase/cli` @ `main`, cloned/fetched 2026-09-16):
- `apps/cli/src/command-internal/container-cli.ts`
- `apps/cli/src/commands/start/SIDE_EFFECTS.md`
- `apps/cli-go/internal/utils/docker.go`
- Commit `39c21c0` "fix(cli): fall back to podman for local typegen (#5658)", 2026-06-23 — the
  same docker→podman subprocess-fallback pattern, for the `gen types --local` command.

## 2. Official system requirements / support matrix

Fetched `https://supabase.com/docs/reference/cli/supabase-start` directly (2026-09-16): its **only**
stated prerequisite is "It is recommended to have at least 7GB of RAM to start all services." It
does not list Docker as a requirement in that page's prerequisites at all, and it does not mention
Podman either — silence, not a refusal. Other, unrelated docs pages (self-hosting via
docker-compose, a different product surface from `supabase start`) do call Docker Desktop "a
prerequisite for local development," and that exact string is also still hard-coded as a hint in
the old Go sidecar (`apps/cli-go/internal/utils/docker.go:350`,
`suggestDockerInstallIfConnectionFailed`) — but that hint only fires from the *unported* Go code
path, not from `start`'s current TypeScript implementation, which has its own Podman-inclusive
error message (§1).

**Net**: no page asserts "Podman is supported," but none asserts "Podman is unsupported" either,
and the shipped source is unambiguous that Podman fallback is deliberately coded for `start`
specifically. Treat this as "unsupported in the marketing docs' prose, supported in the actual
current code" rather than "unsupported, full stop."

**Sources**: `supabase.com/docs/reference/cli/supabase-start`, fetched 2026-09-16;
`apps/cli-go/internal/utils/docker.go`.

## 3. Realistic fallback options — evaluated, none needed

Given §1, none of the three fallback strategies named in this research's brief are necessary:

- **`podman system service` + `DOCKER_HOST=unix:///run/podman/podman.sock`**: irrelevant to the
  current `start` implementation, since it never opens a Docker-API socket — it's a plain
  subprocess call to a `podman`/`docker` binary. This would only matter if a not-yet-ported command
  falls back to the old Go sidecar's Engine-API client, and even then, Podman's Docker-compatible
  API endpoint is what that old client would be hitting — a heavier, more fragile setup than just
  having `podman` on `PATH`, which is already the case here.
- **`podman-docker` package (a `docker` shim wrapping `podman`)**: redundant. It would make the
  *first* spawn attempt (`docker ...`) succeed by silently running `podman` under a different name;
  the CLI already tries `podman` directly as its documented second choice. Installing the shim adds
  a moving part for no behavioral gain in this codepath.
- **Raw `podman run postgres` + hand-applied migrations/pgTAP via `psql`**: a real fallback, but a
  significant downgrade — it loses GoTrue (auth), PostgREST, Storage, Realtime, and Studio, i.e.
  most of what "Supabase" adds over plain Postgres. Current evidence (§1, §4) doesn't support
  needing this; keep it in reserve only if `supabase start` turns out to be broken for a reason
  unrelated to container-runtime selection.

If `supabase start` on the pinned stable version does fail for some other reason, the practical
escalation ladder, cheapest first:
1. Re-run with `--debug` to see which container/health-check failed (the CLI's own diagnostics for
   this are good as of #5966 — an unhealthy container now names itself, its image, and a fix
   command instead of a bare container ID).
2. Check whether the failure matches one of the known, already-fixed Fedora/rootless-Podman/SELinux
   issues in §4, and if so, bump to the `beta` npm dist-tag (`2.118.0-beta.49` as of 2026-09-16,
   `npm view supabase dist-tags`), which contains fixes merged after stable branched.
3. Only if neither resolves it: fall back to raw `podman run postgres` + `psql`-applied migrations
   for the pgTAP/RLS testing portion specifically, and scope real auth (GoTrue) integration testing
   out of this session with a documented reason.

**Sources**: npm registry `dist-tags` for `supabase`, queried 2026-09-16 (`latest: 2.117.0`, `beta:
2.118.0-beta.49`); GitHub issue #5966 "diagnose unrunnable images", commit `e7d4fc9`, 2026-07-28.

## 4. This exact environment profile has been actively targeted, recently

This session's own environment: `getenforce` → `Enforcing`; `podman info` →
`Host.Security.SELinuxEnabled: true`, `Host.Security.Rootless: true`. That is precisely the profile
named in five recent, **closed** supabase/cli issues — a real, current maintenance pattern, not
speculation:

| Issue | Date opened | Fixed by | Problem |
|---|---|---|---|
| [#5989](https://github.com/supabase/cli/issues/5989) | 2026-07-29 | `3b227be` (#5990) | pg-delta's CA bind mount `EACCES` on SELinux-enforcing hosts + rootless Podman — fixed with `--security-opt label:disable`. |
| — | 2026-07-31 | `5e2539c` (#6000) | `start`'s staged secrets (`pgsodium_root.key`, Kong/Supavisor secrets, edge-runtime artifacts) hit the same SELinux label problem — fixed with a `Z` relabel mount option. |
| [#6035](https://github.com/supabase/cli/issues/6035) | 2026-08-03 | `86b2582` (#6048) | `start` fails on Podman: DB container `WorkingDir` set to a host path that doesn't exist inside the container (Docker silently creates it; Podman rejects the container outright). | 
| — | 2026-08-03 | `cfb979d` (#6037) | `start` dies on Podman with "volume already exists" — Podman's compat volume-create endpoint isn't idempotent the way Docker's is. |
| [#6537](https://github.com/supabase/cli/issues/6537) | 2026-09-09 | `347d4a2` (#6543) | Custom auth email-template bind mounts unreadable on SELinux-enforcing hosts — same day fix, but **after** stable 2.117.0 branched (2026-09-07), so only in `beta` today. |

This is unusually strong, dated, first-party evidence for this specific combination (Fedora,
rootless Podman, SELinux enforcing) — not "Podman probably works in general," but "the maintainers
have a working feedback loop finding and fixing exactly this machine's failure modes, weekly, as of
this month."

**Sources**: `getenforce`/`podman info`, this session, 2026-09-16; GitHub issues/commits above,
fetched via `gh api repos/supabase/cli/issues/<n>` and `gh search commits --repo supabase/cli
podman`, 2026-09-16.

## 5. No Docker Compose / `podman-compose` needed

`start`'s own `SIDE_EFFECTS.md` (quoted in §1) states it "does not use Docker Compose" — containers
are brought up sequentially, one `docker`/`podman create`+`start` subprocess call per service. The
absence of `podman-compose`/`docker compose` on this machine (confirmed in this task's given facts)
is therefore **not a blocker for `supabase start`**, even though it would matter for a hand-rolled
self-hosted stack via a `docker-compose.yml` (a different scenario some community guides — e.g. the
`dev.to`/gist links this research's initial search turned up — cover: self-hosting a *production*
Supabase stack, not `supabase start`'s local dev flow).

## 6. CLI install method for Linux, and this repo's install approach

- Latest stable: **`supabase@2.117.0`** (npm `latest` dist-tag; `npm view supabase version` /
  `dist-tags`, checked 2026-09-16, published 2026-09-07). Beta channel is at `2.118.0-beta.49`
  (published 2026-09-16, i.e. today) — very active release cadence.
- **`npm install -g supabase` is deliberately unsupported** — GitHub issue #4496 ("Docs: npm global
  install is unsupported but not documented") confirms this is intentional behavior, not a bug: the
  published npm package is a thin JS shim (`apps/cli/package.json`'s `bin: { supabase:
  "dist/supabase.js" }`) around a separately-versioned platform binary; a global install can drift
  the shim and binary out of version lockstep.
- Officially documented Linux options
  (`supabase.com/docs/guides/local-development/cli/getting-started`, fetched 2026-09-16): Homebrew
  (`brew install supabase/tap/supabase`), native `.deb`/`.rpm`/`.apk` packages from GitHub Releases,
  the standalone-binary installer (`curl -fsSL
  https://raw.githubusercontent.com/supabase/cli/main/install | bash`), or — the one that fits this
  repo's pnpm-workspace convention — as a **project devDependency**: the docs' own example is `npm
  install supabase --save-dev` + `npx supabase <command>`; this repo's pnpm equivalent is `pnpm add
  -D supabase -w` at the workspace root, invoked via `pnpm exec supabase <command>`.

**Recommendation for this repo**: pin `supabase` as an **exact** devDependency version (`"supabase":
"2.117.0"`, not a caret range) — the same reasoning CLAUDE.md already applies to `oxfmt` (a
fast-moving external tool, versioned aggressively, where §4's weekly Podman-behavior churn makes an
unpinned `^2.117.0` a real risk of picking up an untested CLI build mid-session).

**Sources**: `npm view supabase version`/`dist-tags`, 2026-09-16; GitHub issue #4496 (title/state
via `gh api`, 2026-09-16); `supabase.com/docs/guides/local-development/cli/getting-started`, fetched
2026-09-16.

## 7. `@supabase/supabase-js` and `jose` versions

- **`@supabase/supabase-js`**: latest stable is **`2.116.0`** (npm `latest` dist-tag, `npm view
  @supabase/supabase-js version`, checked 2026-09-16).
- **`jose`**: latest stable is **`6.2.12`** (npm `latest` dist-tag, `npm view jose version`, checked
  2026-09-16) — the JWT verification library for server-side (`apps/server`) verification of
  Supabase-issued JWTs against the project's JWKS, independent of the `supabase-js` client SDK
  (which is for browser/client-side auth flows, not for the authoritative server verifying a token
  it receives).

## 8. pgTAP — bundled in the image, but not enabled by default

Confirmed via `supabase.com/docs/guides/database/extensions/pgtap` (fetched 2026-09-16): pgTAP's
shared library ships inside the `supabase/postgres` image `supabase start` uses, but it is **not
turned on** for a fresh database — it needs the same explicit step any other Postgres extension
does:

```sql
create extension pgtap with schema extensions;
```

The docs note directly: "Even though the SQL code is `create extension`, this is the equivalent of
enabling the extension" (nothing is downloaded or compiled at that point — the `.so` is already in
the image).

**Implication for Phase 8**: a migration (or a one-off `psql`/`supabase db execute` step against the
local stack) has to run `CREATE EXTENSION pgtap` before any pgTAP test file can run — this doesn't
happen automatically just because `supabase start` succeeded.

**Source**: `supabase.com/docs/guides/database/extensions/pgtap`, fetched 2026-09-16.

## 9. API key rename — confirmed real and current

CLAUDE.md's claim of a "2026 key rename" is accurate. Confirmed via
`supabase.com/docs/guides/getting-started/api-keys` and `.../migrating-to-new-api-keys` (both
fetched 2026-09-16):

- `anon` (legacy, long-lived JWT) → **publishable key**, format `sb_publishable_...`.
- `service_role` (legacy, long-lived JWT) → **secret key**, format `sb_secret_...` — and unlike the
  single legacy `service_role`, multiple independently-revocable secret keys are supported per
  project.
- Exact env var convention from the docs' own example block:
  ```
  # Safe to expose to the browser. Prefix per your framework.
  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

  # Server-only. Never prefix these, or your bundler will ship the key.
  SUPABASE_URL=https://your-project.supabase.co
  SUPABASE_SECRET_KEY=sb_secret_...
  ```
  This matches CLAUDE.md's `SUPABASE_SECRET_KEY`/`SUPABASE_PUBLISHABLE_KEY` naming exactly for the
  server-only var; for this repo's client (a Vite-built React Router SPA, not Next.js), the
  equivalent public-prefix convention is Vite's `VITE_` prefix, i.e.
  `VITE_SUPABASE_PUBLISHABLE_KEY` — the one adaptation needed from the docs' Next.js-flavored
  example.
- Legacy keys still work today but are on a clock: "Supabase is deprecating the anon and
  service_role keys by the end of 2026." No reason for Phase 8 to build against the legacy names.
- New secret keys carry a browser-request guard: the API gateway inspects requests for a
  secret-key-shaped `apikey` value combined with browser-like headers and 401s that combination —
  worth carrying into Phase 8's server-side Supabase client design (a misconfigured proxy that
  forwards browser headers alongside the secret key fails closed rather than silently granting
  service-role access).

**Sources**: `supabase.com/docs/guides/getting-started/api-keys`,
`supabase.com/docs/guides/getting-started/migrating-to-new-api-keys`, both fetched 2026-09-16.

## Recommendation for Phase 8

Attempt the pgTAP/RLS testing and integration-CI portions of Phase 8 for real this session. Concretely:

1. `pnpm add -D supabase@2.117.0 -w` (exact version, workspace root) — do not use a caret range.
2. Run local dev stack via `pnpm exec supabase start`; expect the `docker`-not-found → `podman`
   fallback to fire silently and work, per §1/§4. If a container fails health checks, `--debug` and
   check against §4's table before assuming a novel bug.
3. Don't configure `auth.email.template.*`/`auth.email.notification.*` in local
   `supabase/config.toml` yet — that's the one dated gap (§4's last row) not in stable 2.117.0. If
   Phase 8 needs custom email templates for real, re-pin to the `beta` dist-tag instead of stable,
   noting the tradeoff (beta churn) explicitly in that commit.
4. Add `create extension pgtap with schema extensions;` to the first migration (or a dedicated
   pgTAP-setup migration) before writing any pgTAP test files — it is not implicitly enabled by
   `supabase start` succeeding (§8).
5. Server-side JWT verification: `jose@6.2.12`. Client SDK: `@supabase/supabase-js@2.116.0`.
6. Use the new key model directly (`sb_publishable_...`/`sb_secret_...`, env vars
   `VITE_SUPABASE_PUBLISHABLE_KEY` client-side and `SUPABASE_SECRET_KEY` server-side) — no reason to
   build against the legacy `anon`/`service_role` names given the 2026 sunset (§9).
7. CI note (not this session's blocker, but worth recording): GitHub Actions' standard Ubuntu
   runners ship Docker preinstalled, so none of this Podman analysis affects `ci.yml` — the
   constraint is purely this local dev machine's toolchain. `supabase start` in CI will use the
   `docker` branch of the same fallback, not `podman`, and should behave identically to how it
   already does for any other Docker-based CI job in this repo.
