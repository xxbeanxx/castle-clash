#!/bin/sh
# Plan Phase 10 testing strategy: "the container renders config.js from env
# vars and refuses to start if a required var is missing." A plain POSIX sh
# script (bats isn't installed here) — run with `sh entrypoint.test.sh`, or
# via `pnpm --filter client run test:entrypoint`. Exits non-zero on any failure.
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
ENTRYPOINT="$HERE/entrypoint.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

failures=0
fail() {
  echo "FAIL: $1" >&2
  failures=$((failures + 1))
}
pass() {
  echo "ok: $1"
}

run_entrypoint() {
  HTML_DIR="$TMP/html" CSP_CONF="$TMP/csp.conf" sh "$ENTRYPOINT" >/dev/null 2>&1
}

mkdir -p "$TMP/html"

# --- renders config.js from env ---------------------------------------------
export GAME_SERVER_URL="wss://game.example.com/some/path"
export SUPABASE_URL="https://abc.supabase.co"
export SUPABASE_PUBLISHABLE_KEY="pk_test_123"

if run_entrypoint; then
  pass "exits 0 with all required vars set"
else
  fail "should exit 0 with all required vars set"
fi

grep -q 'GAME_SERVER_URL: "wss://game.example.com/some/path"' "$TMP/html/config.js" \
  && pass "config.js has GAME_SERVER_URL" || fail "config.js missing GAME_SERVER_URL"
grep -q 'SUPABASE_PUBLISHABLE_KEY: "pk_test_123"' "$TMP/html/config.js" \
  && pass "config.js has SUPABASE_PUBLISHABLE_KEY" || fail "config.js missing SUPABASE_PUBLISHABLE_KEY"

# --- escapes quotes/backslashes so config.js stays valid JS ------------------
GAME_SERVER_URL='ws://x"y\z' run_entrypoint
grep -qF 'GAME_SERVER_URL: "ws://x\"y\\z"' "$TMP/html/config.js" \
  && pass "escapes quotes and backslashes" || fail "did not escape quotes/backslashes"
export GAME_SERVER_URL="wss://game.example.com/some/path"
run_entrypoint

# --- CSP restricts connect-src to the configured origins ---------------------
csp="$(cat "$TMP/csp.conf")"
case "$csp" in
  *"connect-src 'self' wss://game.example.com https://game.example.com https://abc.supabase.co wss://abc.supabase.co;"*)
    pass "CSP connect-src lists exactly the game + Supabase origins (both schemes, paths stripped)" ;;
  *) fail "unexpected connect-src in: $csp" ;;
esac
case "$csp" in
  *"frame-ancestors 'none'"*) pass "CSP forbids framing" ;;
  *) fail "CSP missing frame-ancestors 'none'" ;;
esac

# --- refuses to start when a required var is missing -------------------------
for var in GAME_SERVER_URL SUPABASE_URL SUPABASE_PUBLISHABLE_KEY; do
  if (unset "$var"; run_entrypoint); then
    fail "should refuse to start without $var"
  else
    pass "refuses to start without $var"
  fi
done

if [ "$failures" -gt 0 ]; then
  echo "$failures failure(s)" >&2
  exit 1
fi
echo "all entrypoint tests passed"
