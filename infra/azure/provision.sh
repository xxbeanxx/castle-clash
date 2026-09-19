#!/usr/bin/env bash
# Provisions one castle-clash environment on Azure Container Apps. Idempotent:
# safe to re-run, and each step only creates what is missing.
#
#   infra/azure/provision.sh staging|production
#
# Needs an authenticated `az` session with rights to create resource groups,
# role assignments and app registrations, and to edit the DNS zone below.
# Creates no secret values: the Supabase keys and the smoke token are set by
# `set-runtime-secrets.sh`, and the OIDC identity uses a federated credential
# (no client secret exists to leak). See docs/hosting.md.
set -euo pipefail

ENVIRONMENT="${1:?usage: provision.sh staging|production}"

LOCATION="${LOCATION:-canadacentral}"
DNS_ZONE="${DNS_ZONE:-atomic-nucleus.com}"
DNS_RG="${DNS_RG:-DefaultResourceGroup-CCAN}"
REPO="${REPO:-xxbeanxx/castle-clash}"
# GitHub issues OIDC tokens with the repo's *immutable* subject prefix (owner
# and repo ids baked in) when the repo has opted in — `gh api
# repos/<repo>/actions/oidc/customization/sub` shows it. The federated
# credential must match that exactly or `azure/login` is rejected.
SUB_PREFIX="${SUB_PREFIX:-$(gh api "repos/${REPO}/actions/oidc/customization/sub" --jq .sub_claim_prefix)}"

case "$ENVIRONMENT" in
  staging)
    SUFFIX="staging"
    CLIENT_HOST="castle-clash-staging"
    GAME_HOST="castle-clash-game-staging"
    ;;
  production)
    SUFFIX="prod"
    CLIENT_HOST="castle-clash"
    GAME_HOST="castle-clash-game"
    ;;
  *)
    echo "environment must be staging or production" >&2
    exit 2
    ;;
esac

RG="rg-castle-clash-${SUFFIX}"
CAE="cae-castle-clash-${SUFFIX}"
SERVER_APP="ca-castle-clash-server-${SUFFIX}"
CLIENT_APP="ca-castle-clash-client-${SUFFIX}"
IDENTITY="castle-clash-deploy-${SUFFIX}"
PLACEHOLDER_IMAGE="mcr.microsoft.com/k8se/quickstart:latest"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"

step() { printf '\n== %s\n' "$*"; }

step "resource group ${RG}"
az group create --name "$RG" --location "$LOCATION" --output none

step "container apps environment ${CAE}"
if ! az containerapp env show --name "$CAE" --resource-group "$RG" --output none 2>/dev/null; then
  az containerapp env create --name "$CAE" --resource-group "$RG" --location "$LOCATION" --output none
fi

# The apps start on Microsoft's placeholder image. The first deploy replaces
# the whole template (image, port, probes, scale, env) from infra/azure/*.yaml,
# so nothing here needs to know about the real images, which do not exist until
# a release has been built.
ensure_app() {
  local name="$1"
  if ! az containerapp show --name "$name" --resource-group "$RG" --output none 2>/dev/null; then
    az containerapp create --name "$name" --resource-group "$RG" --environment "$CAE" \
      --image "$PLACEHOLDER_IMAGE" --ingress external --target-port 80 \
      --min-replicas 0 --max-replicas 1 --output none
  fi
}

step "container apps ${SERVER_APP}, ${CLIENT_APP}"
ensure_app "$SERVER_APP"
ensure_app "$CLIENT_APP"

VERIFICATION_ID="$(az containerapp env show --name "$CAE" --resource-group "$RG" \
  --query properties.customDomainConfiguration.customDomainVerificationId -o tsv)"

# CNAME to the app's default hostname plus the `asuid` TXT record Azure checks
# to prove the domain is yours, then a free managed certificate bound to it.
bind_domain() {
  local host="$1" app="$2"
  local fqdn
  fqdn="$(az containerapp show --name "$app" --resource-group "$RG" \
    --query properties.configuration.ingress.fqdn -o tsv)"

  step "dns ${host}.${DNS_ZONE} -> ${fqdn}"
  az network dns record-set cname set-record --resource-group "$DNS_RG" --zone-name "$DNS_ZONE" \
    --record-set-name "$host" --cname "$fqdn" --output none
  az network dns record-set txt add-record --resource-group "$DNS_RG" --zone-name "$DNS_ZONE" \
    --record-set-name "asuid.${host}" --value "$VERIFICATION_ID" --output none

  local hostname="${host}.${DNS_ZONE}"
  if ! az containerapp hostname list --name "$app" --resource-group "$RG" \
    --query "[?name=='${hostname}'] | length(@)" -o tsv | grep -qx 1; then
    az containerapp hostname add --name "$app" --resource-group "$RG" --hostname "$hostname" --output none
  fi
  az containerapp hostname bind --name "$app" --resource-group "$RG" --environment "$CAE" \
    --hostname "$hostname" --validation-method CNAME --output none
}

bind_domain "$GAME_HOST" "$SERVER_APP"
bind_domain "$CLIENT_HOST" "$CLIENT_APP"

step "deploy identity ${IDENTITY} (federated to GitHub environment '${ENVIRONMENT}')"
APP_ID="$(az ad app list --display-name "$IDENTITY" --query '[0].appId' -o tsv)"
if [ -z "$APP_ID" ]; then
  APP_ID="$(az ad app create --display-name "$IDENTITY" --query appId -o tsv)"
  az ad sp create --id "$APP_ID" --output none
fi
APP_OBJECT_ID="$(az ad app show --id "$APP_ID" --query id -o tsv)"
SUBJECT="${SUB_PREFIX}:environment:${ENVIRONMENT}"
if [ "$(az ad app federated-credential list --id "$APP_OBJECT_ID" \
  --query "[?subject=='${SUBJECT}'] | length(@)" -o tsv)" = "0" ]; then
  az ad app federated-credential create --id "$APP_OBJECT_ID" --parameters "{
    \"name\": \"github-environment-${ENVIRONMENT}\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"${SUBJECT}\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }" --output none
fi

# Scoped to this environment's resource group only: the staging identity cannot
# touch production. `Container Apps Contributor` covers `containerapp update`.
RG_SCOPE="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}"
if [ "$(az role assignment list --assignee "$APP_ID" --scope "$RG_SCOPE" \
  --role 'Container Apps Contributor' --query 'length(@)' -o tsv)" = "0" ]; then
  az role assignment create --assignee "$APP_ID" --role 'Container Apps Contributor' \
    --scope "$RG_SCOPE" --output none
fi

cat <<EOF

== done: ${ENVIRONMENT}
   client   https://${CLIENT_HOST}.${DNS_ZONE}
   game     https://${GAME_HOST}.${DNS_ZONE}   (wss:// for the browser)
   identity AZURE_CLIENT_ID=${APP_ID}
            AZURE_TENANT_ID=${TENANT_ID}
            AZURE_SUBSCRIPTION_ID=${SUBSCRIPTION_ID}
   next     1. infra/github/configure-environment.sh ${ENVIRONMENT}   (needs the identity ids above + Supabase values)
            2. infra/azure/set-runtime-secrets.sh ${ENVIRONMENT}      (needs the GitHub environment to exist)
EOF
