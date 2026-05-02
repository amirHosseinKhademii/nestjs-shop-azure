# ─────────────────────────────────────────────────────────────────────────────
# outputs.tf
#
# Surfaces useful values from the apply for humans and downstream tooling:
#
#   • Print one value:    terraform output postgres_fqdn
#   • Print all values:   terraform output
#   • Machine-readable:   terraform output -json | jq .acr_login_server.value
#
# Why outputs instead of just using the resource attributes elsewhere:
#   - They're stored in state, so a `terraform output` call after the fact
#     doesn't need to re-plan the whole module.
#   - They form a stable contract for shell scripts / CI that wire these
#     values into Kubernetes Secrets, Helm values, or .env files.
#
# Mark an output `sensitive = true` to redact it from `terraform output`
# (we don't here because nothing in this list is a secret — connection
# strings still need usernames/passwords from variables).
# ─────────────────────────────────────────────────────────────────────────────

# Name of the Resource Group everything was placed under. Handy for
# `az group delete -n <this> --yes --no-wait` to nuke the demo when done.
output "resource_group_name" {
  value = azurerm_resource_group.this.name
}

# FQDN of the Azure Container Registry, e.g. `shopdemoacr.azurecr.io`. Used by
# `docker tag` / `docker push` and the AKS imagePullSecret-less integration
# (we granted `AcrPull` to the kubelet identity in main.tf).
output "acr_login_server" {
  value = azurerm_container_registry.this.login_server
}

# AKS cluster name. Plug into `az aks get-credentials -g <rg> -n <this>` to
# merge a kubeconfig context for kubectl.
output "aks_name" {
  value = azurerm_kubernetes_cluster.this.name
}

# Redis hostname (e.g. `shopdemo-redis.redis.cache.windows.net`). Combine
# with the primary access key (fetched separately via `az redis list-keys`)
# to build the `REDIS_URL=rediss://:KEY@HOST:6380` shop-svc consumes.
output "redis_hostname" {
  value = azurerm_redis_cache.this.hostname
}

# Service Bus namespace name. Used by the order-svc consumer / shop-svc
# producer when they build the `SERVICEBUS_CONNECTION_STRING`. The actual
# connection string is fetched from the namespace's auth rules at deploy
# time, not from here, so we never put secrets in outputs.
output "servicebus_namespace" {
  value = azurerm_servicebus_namespace.this.name
}

# Plain-English reminder of which MongoDB hosting path this deployment is
# sized for — see variable `mongo_choice` above. Terraform doesn't create
# the Mongo instance itself.
output "mongo_choice_note" {
  value = "MongoDB: use MongoDB Atlas, Azure Cosmos DB for MongoDB, or dev-only Docker — see infra/terraform/README.md"
}

# Fully-qualified hostname of the Postgres Flexible Server, e.g.
# `shopdemo-pg-ab12c.postgres.database.azure.com`. user-svc / order-svc
# read this as `PGHOST`. Always combine with `PGSSL=true`, Azure mandates TLS.
output "postgres_fqdn" {
  value       = azurerm_postgresql_flexible_server.this.fqdn
  description = "Set PGHOST to this value for user-svc"
}

# Database name created on the server. user-svc reads this as `USER_DB`.
# Shared across user-svc and order-svc (each owns disjoint tables).
output "postgres_database" {
  value       = azurerm_postgresql_flexible_server_database.user_app.name
  description = "Matches USER_DB for user-svc"
}

# Admin login Terraform set on the server (`pgadmin` by default). user-svc
# reads this as `PGUSER`. The password is intentionally NOT exposed here —
# pull it from your tfvars / Key Vault when wiring the deployment.
output "postgres_admin_login" {
  value       = azurerm_postgresql_flexible_server.this.administrator_login
  description = "Set PGUSER"
}
