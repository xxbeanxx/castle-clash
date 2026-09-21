#!/usr/bin/env bash
# Runs the required CI checks the way a CI runner sees them, BEFORE a PR is opened.
#
#   pnpm preflight                # verify + browser + landing budget
#   pnpm preflight --lighthouse   # ... plus CI's 3 Lighthouse runs (needs podman)
#   pnpm preflight --keep         # keep the scratch clone afterwards
#
# It checks out the COMMITTED HEAD into a scratch clone (`git clone --local`), so it has no
# `packages/shared/dist`, no untracked `.env*`, no leftover build directories: the things a
# working tree hides and that have failed PRs before. Uncommitted changes are NOT tested;
# commit first (the script refuses a dirty tree). Commands mirror .github/workflows/ci.yaml:
# if that file changes, change this one.
#
# Not covered (too heavy for one command; recipes are in CLAUDE.md): the e2e suite against the
# built client behind nginx, the container build/smoke path, and Lighthouse A/B comparisons.
set -euo pipefail

lighthouse=0
keep=0
for arg in "$@"; do
  case "$arg" in
    --lighthouse) lighthouse=1 ;;
    --keep) keep=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

repo="$(git rev-parse --show-toplevel)"
if [ -n "$(git -C "$repo" status --porcelain)" ]; then
  echo "preflight: the working tree has uncommitted changes; commit them first (only HEAD is tested)." >&2
  exit 1
fi

scratch="$(mktemp -d "${PREFLIGHT_DIR:-${TMPDIR:-/tmp}}/cc-preflight-XXXXXX")"
clean="$scratch/clean"
cleanup() {
  podman rm -f cc-preflight-web >/dev/null 2>&1 || true
  if [ "$keep" = 1 ]; then echo "preflight: kept $clean"; else rm -rf "$scratch"; fi
}
trap cleanup EXIT

step() { printf '\n== %s ==\n' "$*"; }

step "clone $(git -C "$repo" rev-parse --short HEAD) into $clean"
git clone --quiet --local --no-hardlinks "$repo" "$clean"
git -C "$clean" checkout --quiet "$(git -C "$repo" rev-parse HEAD)"
cd "$clean"

step "install (frozen lockfile)"
pnpm install --frozen-lockfile

# ci.yaml `verify`
step "verify: lint, typecheck, build"
pnpm turbo run lint typecheck build
step "verify: tests (shared runs below with coverage)"
FC_SEED="${FC_SEED:-$RANDOM$RANDOM}" pnpm turbo run test --filter='!@castle-clash/shared'
step "verify: shared coverage"
FC_SEED="${FC_SEED:-$RANDOM$RANDOM}" pnpm --filter @castle-clash/shared run test:coverage

# ci.yaml `browser`: a clean runner has no shared dist, so remove what `verify` built and rebuild
# exactly as the job does.
step "browser: vitest browser mode"
pnpm --filter @castle-clash/client exec playwright install chromium
rm -rf packages/shared/dist
pnpm --filter @castle-clash/shared run build
pnpm --filter @castle-clash/client run test:browser

# ci.yaml `web-quality`, the deterministic half (`verify` already built the client)
step "web-quality: landing page script graph"
pnpm --filter @castle-clash/client run check:landing

if [ "$lighthouse" = 1 ]; then
  step "web-quality: Lighthouse x3 behind the production nginx config"
  HTML_DIR="$clean/apps/client/build/client" CSP_CONF="$scratch/csp-headers.conf" \
    GAME_SERVER_URL=wss://game.example.test SUPABASE_URL=https://project.supabase.example \
    SUPABASE_PUBLISHABLE_KEY=lighthouse sh apps/client/docker/entrypoint.sh
  podman run -d --name cc-preflight-web --network host --security-opt label=disable \
    -v "$clean/apps/client/build/client:/usr/share/nginx/html:ro" \
    -v "$clean/apps/client/docker/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
    -v "$scratch/csp-headers.conf:/tmp/csp-headers.conf:ro" \
    docker.io/nginxinc/nginx-unprivileged:1.31-alpine
  for _ in $(seq 1 30); do curl -fs http://127.0.0.1:8080/ >/dev/null && break; sleep 1; done
  CHROME_PATH="$(pnpm --filter @castle-clash/client exec node -p "require('playwright').chromium.executablePath()")"
  export CHROME_PATH
  for i in 1 2 3; do
    npx -y lighthouse@12.8.2 http://127.0.0.1:8080/ \
      --chrome-flags="--headless=new --no-sandbox" \
      --only-categories=performance,accessibility \
      --output=json --output-path="$scratch/lh-$i.json" --quiet
  done
  node apps/client/scripts/web-quality.mjs lighthouse "$scratch"/lh-1.json "$scratch"/lh-2.json "$scratch"/lh-3.json
fi

printf '\npreflight passed for %s\n' "$(git -C "$repo" rev-parse --short HEAD)"
