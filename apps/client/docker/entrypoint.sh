#!/bin/sh
set -eu

: "${GAME_SERVER_URL:?GAME_SERVER_URL is required}"
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_PUBLISHABLE_KEY:?SUPABASE_PUBLISHABLE_KEY is required}"

escape_json() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat > /usr/share/nginx/html/config.js <<EOF
window.__CONFIG__ = {
  GAME_SERVER_URL: "$(escape_json "$GAME_SERVER_URL")",
  SUPABASE_URL: "$(escape_json "$SUPABASE_URL")",
  SUPABASE_PUBLISHABLE_KEY: "$(escape_json "$SUPABASE_PUBLISHABLE_KEY")"
};
EOF
