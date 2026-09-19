terraform {
  # State lives in a dedicated storage account in DefaultResourceGroup-CCAN, next to
  # the atomic-nucleus.com DNS zone. It is bootstrapped by hand (a backend cannot
  # create itself), see README.md. Authentication is Entra ID (`az login`), not a
  # storage key: the operator needs "Storage Blob Data Contributor" on the account.

  backend "azurerm" {
    resource_group_name  = "DefaultResourceGroup-CCAN"
    storage_account_name = "stcastleclashtfstate"
    container_name       = "tfstate"
    key                  = "castle-clash.tfstate"
    use_azuread_auth     = true
  }
}
