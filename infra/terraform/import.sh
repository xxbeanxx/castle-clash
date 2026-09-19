#!/usr/bin/env bash
# One-off: adopts the resources that infra/azure/provision.sh created by hand into
# Terraform state. Idempotent (skips anything already in state) and read-only
# against Azure: `terraform import` only writes the state file. Afterwards
# `terraform plan` should show no changes; if it does, adjust the .tf files (not
# the resources) until it is clean. Kept as a record of what was imported and to
# rebuild state if the state blob is ever lost.
#
#   az login && infra/terraform/import.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

SUB="42bf0527-ba43-4c35-b994-ab2a570a6492"
RG="rg-castle-clash"
DNS_RG="DefaultResourceGroup-CCAN"
ZONE="atomic-nucleus.com"
CAE="cae-castle-clash"

RG_ID="/subscriptions/${SUB}/resourceGroups/${RG}"
CAE_ID="${RG_ID}/providers/Microsoft.App/managedEnvironments/${CAE}"
ZONE_ID="/subscriptions/${SUB}/resourceGroups/${DNS_RG}/providers/Microsoft.Network/dnsZones/${ZONE}"

in_state="$(terraform state list 2>/dev/null || true)"
import_one() {
  local address="$1" id="$2"
  if grep -qxF "$address" <<<"$in_state"; then
    echo "skip   ${address} (already in state)"
  else
    echo "import ${address}"
    terraform import -input=false "$address" "$id"
  fi
}

import_one azurerm_resource_group.main "$RG_ID"
import_one azurerm_log_analytics_workspace.main "${RG_ID}/providers/Microsoft.OperationalInsights/workspaces/log-castle-clash"
import_one azurerm_container_app_environment.main "$CAE_ID"

for key in server client; do
  app="ca-castle-clash-${key}"
  import_one "azurerm_container_app.app[\"${key}\"]" "${RG_ID}/providers/Microsoft.App/containerApps/${app}"
done

declare -A HOST=([server]=castle-clash-game [client]=castle-clash)
declare -A CERT=([server]=mc-cae-castle-cla-castle-clash-gam-1459 [client]=mc-cae-castle-cla-castle-clash-ato-5430)
for key in server client; do
  host="${HOST[$key]}"
  app="ca-castle-clash-${key}"
  import_one "azurerm_dns_cname_record.site[\"${key}\"]" "${ZONE_ID}/CNAME/${host}"
  import_one "azurerm_dns_txt_record.asuid[\"${key}\"]" "${ZONE_ID}/TXT/asuid.${host}"
  import_one "azurerm_container_app_environment_managed_certificate.site[\"${key}\"]" "${CAE_ID}/managedCertificates/${CERT[$key]}"
  import_one "azurerm_container_app_custom_domain.site[\"${key}\"]" \
    "${RG_ID}/providers/Microsoft.App/containerApps/${app}/customDomainName/${host}.${ZONE}"
done

# Entra objects are addressed by object id, not client id.
APP_OBJECT_ID="$(az ad app list --display-name castle-clash-deploy-prod --query '[0].id' -o tsv)"
APP_CLIENT_ID="$(az ad app list --display-name castle-clash-deploy-prod --query '[0].appId' -o tsv)"
SP_OBJECT_ID="$(az ad sp show --id "$APP_CLIENT_ID" --query id -o tsv)"
CRED_ID="$(az ad app federated-credential list --id "$APP_OBJECT_ID" --query "[?name=='github-environment-production'].id | [0]" -o tsv)"
ROLE_ASSIGNMENT_ID="$(az role assignment list --assignee "$APP_CLIENT_ID" --scope "$RG_ID" --role 'Container Apps Contributor' --query '[0].id' -o tsv)"

import_one azuread_application.deploy "/applications/${APP_OBJECT_ID}"
import_one azuread_service_principal.deploy "/servicePrincipals/${SP_OBJECT_ID}"
import_one azuread_application_federated_identity_credential.github_production "${APP_OBJECT_ID}/federatedIdentityCredential/${CRED_ID}"
import_one azurerm_role_assignment.deploy "$ROLE_ASSIGNMENT_ID"
