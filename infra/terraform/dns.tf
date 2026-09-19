data "azurerm_dns_zone" "main" {
  # The atomic-nucleus.com zone belongs to another repository's Terraform; this
  # configuration only reads it and owns the castle-clash records inside it.

  name                = var.dns_zone_name
  resource_group_name = var.dns_zone_resource_group_name
}

locals {
  # Managed certificate names are chosen by Azure when created from the CLI or
  # portal; they are pinned here because the name forces replacement.

  sites = {
    server = { cert_name = "mc-cae-castle-cla-castle-clash-gam-1459" }
    client = { cert_name = "mc-cae-castle-cla-castle-clash-ato-5430" }
  }
}

resource "azurerm_dns_cname_record" "site" {
  # <host>.atomic-nucleus.com -> the app's default *.azurecontainerapps.io name.

  for_each = local.apps

  name                = each.value.host
  zone_name           = data.azurerm_dns_zone.main.name
  resource_group_name = data.azurerm_dns_zone.main.resource_group_name
  ttl                 = 3600
  record              = azurerm_container_app.app[each.key].ingress[0].fqdn
}

resource "azurerm_dns_txt_record" "asuid" {
  # asuid.<host>: the TXT record Azure checks to prove the domain is ours. The
  # verification id is per environment, shared by every app in it.

  for_each = local.apps

  name                = "asuid.${each.value.host}"
  zone_name           = data.azurerm_dns_zone.main.name
  resource_group_name = data.azurerm_dns_zone.main.resource_group_name
  ttl                 = 3600

  record {
    value = azurerm_container_app_environment.main.custom_domain_verification_id
  }
}

resource "azurerm_container_app_environment_managed_certificate" "site" {
  # Free managed certificates, validated by the CNAME above.

  for_each = local.sites

  name                         = each.value.cert_name
  container_app_environment_id = azurerm_container_app_environment.main.id
  subject_name                 = "${local.apps[each.key].host}.${var.dns_zone_name}"
  domain_control_validation    = "CNAME"

  depends_on = [azurerm_dns_cname_record.site, azurerm_dns_txt_record.asuid]
}

resource "azurerm_container_app_custom_domain" "site" {
  # The hostname registered on each app. The managed certificate is bound to it by
  # Azure itself (`az containerapp hostname bind`), and the
  # provider cannot express that binding for a *managed* certificate: its
  # `container_app_environment_certificate_id` only parses uploaded-certificate IDs
  # and rejects `.../managedCertificates/...`. So the binding arguments are ignored
  # rather than configured; the provider reads the bound cert back into the
  # computed `container_app_environment_managed_certificate_id`.

  for_each = local.apps

  name             = "${each.value.host}.${var.dns_zone_name}"
  container_app_id = azurerm_container_app.app[each.key].id

  lifecycle {
    ignore_changes = [
      certificate_binding_type,
      container_app_environment_certificate_id,
    ]
  }

  depends_on = [azurerm_container_app_environment_managed_certificate.site]
}
