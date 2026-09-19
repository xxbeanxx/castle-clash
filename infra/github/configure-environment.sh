#!/usr/bin/env bash
# Creates (or updates) one GitHub environment for the deploy workflows and
# fills in its variables and secrets from the shell environment.
#
#   AZURE_CLIENT_ID=... AZURE_TENANT_ID=... AZURE_SUBSCRIPTION_ID=... \
#   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
#   SUPABASE_DB_URL='postgresql://postgres.<ref>:<pw>@aws-...pooler.supabase.com:5432/postgres' \
#   infra/github/configure-environment.sh staging|production
#
# `production` gets a required reviewer (the repo owner by default; set
# REVIEWER_LOGIN to change it). Values are read from the environment and piped
# to `gh secret set`, never echoed or placed on a command line. SMOKE_TOKEN is
# not set here: infra/azure/set-runtime-secrets.sh owns it.
set -euo pipefail

ENVIRONMENT="${1:?usage: configure-environment.sh staging|production}"
REPO="${REPO:-xxbeanxx/castle-clash}"
DNS_ZONE="${DNS_ZONE:-atomic-nucleus.com}"

case "$ENVIRONMENT" in
  staging)
    SUFFIX="staging"; CLIENT_HOST="castle-clash-staging"; GAME_HOST="castle-clash-game-staging"
    CLIENT_MIN_REPLICAS=0; SERVER_CPU="1.0"; SERVER_MEMORY="2Gi"
    ;;
  production)
    SUFFIX="prod"; CLIENT_HOST="castle-clash"; GAME_HOST="castle-clash-game"
    CLIENT_MIN_REPLICAS=1; SERVER_CPU="2.0"; SERVER_MEMORY="4Gi"
    ;;
  *) echo "environment must be staging or production" >&2; exit 2 ;;
esac

for name in AZURE_CLIENT_ID AZURE_TENANT_ID AZURE_SUBSCRIPTION_ID SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_DB_URL; do
  if [ -z "${!name:-}" ]; then
    echo "${name} must be set" >&2
    exit 2
  fi
done

if [ "$ENVIRONMENT" = "production" ]; then
  reviewer="${REVIEWER_LOGIN:-${REPO%%/*}}"
  reviewer_id="$(gh api "users/${reviewer}" --jq .id)"
  gh api --method PUT "repos/${REPO}/environments/${ENVIRONMENT}" \
    --input - <<JSON >/dev/null
{"reviewers":[{"type":"User","id":${reviewer_id}}],"prevent_self_review":false,"deployment_branch_policy":null}
JSON
  echo "environment 'production' requires approval from ${reviewer}"
else
  gh api --method PUT "repos/${REPO}/environments/${ENVIRONMENT}" >/dev/null
fi

setvar() { gh variable set "$1" --repo "$REPO" --env "$ENVIRONMENT" --body "$2"; }
setvar AZURE_RESOURCE_GROUP "rg-castle-clash-${SUFFIX}"
setvar SERVER_APP "ca-castle-clash-server-${SUFFIX}"
setvar CLIENT_APP "ca-castle-clash-client-${SUFFIX}"
setvar GAME_SERVER_URL "wss://${GAME_HOST}.${DNS_ZONE}"
setvar CLIENT_URL "https://${CLIENT_HOST}.${DNS_ZONE}"
setvar SERVER_CPU "$SERVER_CPU"
setvar SERVER_MEMORY "$SERVER_MEMORY"
setvar CLIENT_MIN_REPLICAS "$CLIENT_MIN_REPLICAS"
setvar SUPABASE_URL "$SUPABASE_URL"
# The publishable key is designed to ship in every browser bundle; a variable
# (visible in logs) is the honest classification, and it makes a misconfigured
# deploy debuggable.
setvar SUPABASE_PUBLISHABLE_KEY "$SUPABASE_PUBLISHABLE_KEY"

setsecret() { printf '%s' "${!1}" | gh secret set "$1" --repo "$REPO" --env "$ENVIRONMENT"; }
setsecret AZURE_CLIENT_ID
setsecret AZURE_TENANT_ID
setsecret AZURE_SUBSCRIPTION_ID
setsecret SUPABASE_DB_URL

echo "environment '${ENVIRONMENT}' configured on ${REPO}"
