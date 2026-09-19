#!/bin/sh
set -eu

: "${GAME_SERVER_URL:?GAME_SERVER_URL is required}"
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_PUBLISHABLE_KEY:?SUPABASE_PUBLISHABLE_KEY is required}"

# Overridable only so `entrypoint.test.sh` can run this without root/nginx.
HTML_DIR="${HTML_DIR:-/usr/share/nginx/html}"
CSP_CONF="${CSP_CONF:-/tmp/csp-headers.conf}"

escape_json() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat > "$HTML_DIR/config.js" <<EOF
window.__CONFIG__ = {
  GAME_SERVER_URL: "$(escape_json "$GAME_SERVER_URL")",
  SUPABASE_URL: "$(escape_json "$SUPABASE_URL")",
  SUPABASE_PUBLISHABLE_KEY: "$(escape_json "$SUPABASE_PUBLISHABLE_KEY")"
};
EOF

# scheme://host[:port] with any path/query stripped — a CSP source expression
# is an origin, not a URL.
origin_of() {
  printf '%s' "$1" | sed -E 's#^([a-zA-Z][a-zA-Z0-9+.-]*://[^/?#]+).*#\1#'
}

# Both the ws(s) and http(s) forms of an origin: Colyseus matchmakes over
# HTTP(S) and then upgrades to WS(S); Supabase uses HTTP(S) plus a realtime WS.
both_schemes() {
  case "$1" in
    ws://*) printf '%s http://%s' "$1" "${1#ws://}" ;;
    wss://*) printf '%s https://%s' "$1" "${1#wss://}" ;;
    http://*) printf '%s ws://%s' "$1" "${1#http://}" ;;
    https://*) printf '%s wss://%s' "$1" "${1#https://}" ;;
    *) printf '%s' "$1" ;;
  esac
}

GAME_ORIGINS="$(both_schemes "$(origin_of "$GAME_SERVER_URL")")"
SUPABASE_ORIGINS="$(both_schemes "$(origin_of "$SUPABASE_URL")")"

# Plan Phase 10 step 2: a CSP restricting `connect-src` to the game server and
# Supabase origins. `script-src` needs 'unsafe-inline' because React Router's
# SPA-mode build inlines its hydration scripts into index.html (verified in
# the built output) — hashing them at container start isn't possible without
# tooling this image doesn't ship. `style-src` needs it for React's inline
# `style=` attributes. Written to a file nginx `include`s (see nginx.conf)
# because these origins are only known at container start, not build time.
cat > "$CSP_CONF" <<EOF
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self' $GAME_ORIGINS $SUPABASE_ORIGINS; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" always;
EOF
