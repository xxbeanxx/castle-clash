#!/usr/bin/env bash
# Stores the server's runtime secrets as Container App secrets, and the smoke
# token in the matching GitHub environment so the deploy smoke can present it.
#
#   SUPABASE_SECRET_KEY=sb_secret_... infra/azure/set-runtime-secrets.sh staging|production
#
# The Supabase secret key comes from the environment, never a file or argv (it
# would show in `ps` and shell history). The smoke token is generated here the
# first time and reused afterwards (re-running rotates nothing unless
# ROTATE_SMOKE_TOKEN=1). No value is ever printed.
set -euo pipefail

ENVIRONMENT="${1:?usage: set-runtime-secrets.sh staging|production}"
REPO="${REPO:-xxbeanxx/castle-clash}"
: "${SUPABASE_SECRET_KEY:?SUPABASE_SECRET_KEY must be set in the environment}"

case "$ENVIRONMENT" in
  staging) SUFFIX="staging" ;;
  production) SUFFIX="prod" ;;
  *) echo "environment must be staging or production" >&2; exit 2 ;;
esac
RG="rg-castle-clash-${SUFFIX}"
SERVER_APP="ca-castle-clash-server-${SUFFIX}"

# Secret *values* are unreadable on both sides, so "generate a new token" is
# decided by presence: if either the GitHub environment or the Container App
# lacks one (a half-finished earlier run), make a fresh one and set both, so
# the two can never disagree.
in_github="$(gh secret list --repo "$REPO" --env "$ENVIRONMENT" --json name --jq '[.[] | select(.name=="SMOKE_TOKEN")] | length')"
in_app="$(az containerapp secret list --name "$SERVER_APP" --resource-group "$RG" --query "[?name=='smoke-token'] | length(@)" -o tsv)"
if [ "${ROTATE_SMOKE_TOKEN:-0}" = "1" ] || [ "$in_github" = "0" ] || [ "$in_app" = "0" ]; then
  SMOKE_TOKEN="$(openssl rand -hex 32)"
  printf '%s' "$SMOKE_TOKEN" | gh secret set SMOKE_TOKEN --repo "$REPO" --env "$ENVIRONMENT"
  echo "generated a new SMOKE_TOKEN in GitHub environment '${ENVIRONMENT}'"
else
  echo "SMOKE_TOKEN already exists in GitHub environment '${ENVIRONMENT}'; keeping it"
  SMOKE_TOKEN=""
fi

# Container App secret names are capped at 20 chars. `--secrets` takes
# key=value on argv, which is briefly visible in the process list on this
# machine; acceptable for an operator's own workstation, not for shared CI.
secrets=("supabase-secret-key=${SUPABASE_SECRET_KEY}")
if [ -n "$SMOKE_TOKEN" ]; then
  secrets+=("smoke-token=${SMOKE_TOKEN}")
fi
az containerapp secret set --name "$SERVER_APP" --resource-group "$RG" \
  --secrets "${secrets[@]}" --output none

echo "container app '${SERVER_APP}' secrets updated: $(printf '%s ' "${secrets[@]%%=*}")"
