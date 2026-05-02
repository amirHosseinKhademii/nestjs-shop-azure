# Terraform — AKS for the `azure-guide.md` walkthrough

Provisions **everything `azure-guide.md` builds by hand** in a single
`terraform apply`:

| What | File | Mirrors guide phase |
| --- | --- | --- |
| Resource group | [`main.tf`](./main.tf) | Phase 3.2 |
| AKS cluster (managed identity + OIDC issuer + workload identity + Azure CNI) | [`main.tf`](./main.tf) | Phase 3.3 |
| App Registration + Service Principal | [`cicd.tf`](./cicd.tf) | Phase 6.1 |
| Federated credentials (per branch + per environment) | [`cicd.tf`](./cicd.tf) | Phase 6.2 |
| RBAC role assignments on the cluster | [`cicd.tf`](./cicd.tf) | Phase 6.3 |
| All values you need to paste into GitHub | [`outputs.tf`](./outputs.tf) | Phase 6.4 |
| **(opt-in)** Key Vault + UAMI + workload-identity federation for Pods | [`keyvault.tf`](./keyvault.tf) | Phase 9 |

Things this Terraform **does not** do — same as the CLI guide:

- **ingress-nginx** install (Helm, in-cluster — Phase 4.1)
- **Kubernetes Secret** seeding (handled by the `seed-secrets-aks` CD job, OR by the CSI driver in Phase 9)
- **App deploy** (handled by the `deploy-aks` CD job)
- **Azure DevOps Service Connection** — managed in the ADO UI, see Phase 6.7 of the guide. (You can re-use the same App Registration + RBAC assignments this Terraform creates by adding extra federated credentials manually.)

Those three are post-cluster Kubernetes concerns and belong in the CD
pipeline, not in the cluster-provisioning Terraform — keeps the blast
radius of `terraform destroy` predictable.

> Why a separate folder from `infra/terraform/`? That older folder
> provisions a different target (PostgreSQL + Redis + Service Bus + ACR
> for a fully-Azure-hosted backend). This one does only what the
> azure-guide walkthrough does — clean separation, you pick the one
> that matches what you want.

---

## Prerequisites

| Tool | Install (macOS / Linux) |
| --- | --- |
| Terraform ≥ 1.6 | `brew install terraform` / [download](https://developer.hashicorp.com/terraform/downloads) |
| Azure CLI | `brew install azure-cli` / `curl -sL https://aka.ms/InstallAzureCLIDeb \| sudo bash` |

```bash
az login
az account set --subscription "<id-or-name>"
az account show           # confirm you're on the right subscription
```

Both providers (`azurerm` + `azuread`) pick up the active `az login`
context automatically — no environment variables needed for local use.

---

## One-shot apply

```bash
cd infra/azure/terraform

cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars     # set github_repo at minimum

terraform init               # downloads providers + creates .terraform/
terraform plan -out tf.plan  # ~30 changes the first time
terraform apply tf.plan      # ~5–7 min — AKS is the slow bit
```

After apply, the outputs print everything you need next:

```bash
terraform output kubeconfig_command   # paste into shell
terraform output github_variables     # paste into GitHub Variables tab
terraform output github_secrets       # paste into GitHub Secrets tab
```

The kubeconfig command points your local `kubectl` at the new
cluster. From there, follow `azure-guide.md` from **Phase 4** onward
(ingress-nginx install + the rest of the deploy).

### Wiring it into the CD pipeline

`AZURE_CLIENT_ID` is in the **secret** outputs map. To pipe directly
into `gh secret set`:

```bash
# Variables
gh variable set AKS_CLUSTER_NAME      --body "$(terraform output -raw cluster_name)"
gh variable set AKS_RESOURCE_GROUP    --body "$(terraform output -raw resource_group_name)"
gh variable set AZURE_TENANT_ID       --body "$(terraform output -json github_variables | jq -r .AZURE_TENANT_ID)"
gh variable set AZURE_SUBSCRIPTION_ID --body "$(terraform output -json github_variables | jq -r .AZURE_SUBSCRIPTION_ID)"

# Secret (the only one Terraform produces — the rest are app secrets you set yourself)
gh secret set AZURE_CLIENT_ID --body "$(terraform output -json github_secrets | jq -r .AZURE_CLIENT_ID)"
```

App secrets that Terraform deliberately does **not** know about:

```bash
gh secret set JWT_SECRET   --body "$(openssl rand -base64 48)"
gh secret set DATABASE_URL --body "postgresql://USER:PASS@HOST.neon.tech/neondb?sslmode=require"
gh secret set MONGO_URI    --body "mongodb+srv://USER:PASS@HOST.mongodb.net/shop?retryWrites=true&w=majority"
gh secret set REDIS_URL    --body "rediss://default:PASS@HOST.upstash.io:6379"
gh secret set DOCKERHUB_USERNAME --body "<your-dockerhub-username>"
gh secret set DOCKERHUB_TOKEN    --body "<dockerhub-pat>"
```

---

## File layout

```
infra/azure/terraform/
├── README.md                 # this file
├── providers.tf              # Terraform + provider versions, backend hint
├── variables.tf              # all inputs (only github_repo is mandatory)
├── main.tf                   # resource group + AKS cluster
├── cicd.tf                   # App Registration, federation, RBAC (CI auth)
├── keyvault.tf               # opt-in: Key Vault + UAMI + Pod federation
├── outputs.tf                # values to paste into GitHub / SecretProviderClass
├── terraform.tfvars.example  # cp this → terraform.tfvars
└── .gitignore                # state, plans, tfvars — never commit
```

Each `.tf` file is single-purpose so opening one tells you a contained
story. Splitting `cicd.tf` from `main.tf` also means
`terraform destroy -target=...cicd...` works for revoking CI access
without touching the cluster.

---

## Common operations

### Add a new branch / environment that's allowed to deploy

```hcl
# terraform.tfvars
github_branches     = ["main", "release/*"]
github_environments = ["production-aks", "staging-aks"]
```

```bash
terraform apply           # adds new federated credentials, no cluster downtime
```

### Resize the node pool

```bash
terraform apply -var node_count=3
```

(`main.tf` has `lifecycle.ignore_changes = [default_node_pool[0].node_count]`
so manual `az aks scale` won't fight Terraform.)

### Rotate the App Registration

```bash
terraform taint azuread_application.ci
terraform apply
```

This destroys the App + SP + all federated creds and re-creates them
with a new client ID. You'll need to update `AZURE_CLIENT_ID` in
GitHub Secrets after.

### Enable Key Vault (Phase 9 of the guide)

```bash
# Either set in terraform.tfvars:
echo 'enable_key_vault = true' >> terraform.tfvars

# …or pass on the CLI:
terraform apply -var enable_key_vault=true
```

After apply, follow Phase 9.2 onwards in the guide to seed actual
secret values into the vault. Terraform deliberately does **not** know
the secret values — that keeps `terraform.tfstate` (which is plaintext
on your laptop unless you've set up a remote backend) from becoming a
secret store.

The outputs print the exact values to plug into the
`SecretProviderClass` YAML and the ServiceAccount annotation:

```bash
terraform output keyvault_name           # → SecretProviderClass.spec.parameters.keyvaultName
terraform output app_identity_client_id  # → SecretProviderClass.spec.parameters.clientID
                                          #   AND ServiceAccount annotation azure.workload.identity/client-id
terraform output secret_seeding_commands # → ready-to-paste `az keyvault secret set` lines
```

### Lock down for prod

In [`main.tf`](./main.tf), turn the cluster API server private:

```hcl
api_server_access_profile {
  authorized_ip_ranges = ["1.2.3.4/32", "5.6.7.8/32"]   # GitHub runners egress + your office
}
```

In [`cicd.tf`](./cicd.tf), swap the cluster-wide RBAC role for a
namespace-scoped one:

```hcl
resource "azurerm_role_assignment" "aks_rbac_admin" {
  principal_id         = azuread_service_principal.ci.object_id
  scope                = "${azurerm_kubernetes_cluster.this.id}/namespaces/shop"
  role_definition_name = "Azure Kubernetes Service RBAC Writer"   # not Admin
}
```

---

## Teardown

```bash
terraform destroy
# Confirms a list of ~10 resources. ~3 min for AKS to deprovision.
```

What survives a `terraform destroy`:

- Nothing in your subscription that you didn't create here.
- Local files: `terraform.tfvars`, `.terraform/`, `*.tfstate*` —
  delete by hand if you're truly done.

What `terraform destroy` does **not** touch:

- The Kubernetes objects you applied with `kubectl apply -k …` —
  irrelevant, the whole cluster is gone.
- ingress-nginx Helm release — same reason.
- GitHub Variables / Secrets — those live in GitHub, not Azure. Either
  leave them (they fail closed when the cluster is gone) or
  `gh variable delete AKS_CLUSTER_NAME` etc.

---

## State management for teams

The default config keeps `terraform.tfstate` on your laptop. Fine for
solo demo work; **break-glass for anyone else**. Switch to remote
state before a second engineer touches this folder:

```bash
# 1. One-time bootstrap (do NOT manage these via this Terraform).
RG=tfstate-rg
SA=tfstateshopdemo$RANDOM            # globally unique, lowercase
az group create -n $RG -l westeurope
az storage account create -g $RG -n $SA --sku Standard_LRS \
  --encryption-services blob --min-tls-version TLS1_2
az storage container create --account-name $SA -n tfstate

# 2. Uncomment the `backend "azurerm" { ... }` block in providers.tf,
#    fill in the names above.

# 3. Migrate state.
terraform init -migrate-state
```

Locking is automatic via blob lease — concurrent applies block instead
of corrupting state.

---

## See also

- [`../aks-overlay/azure-guide.md`](../aks-overlay/azure-guide.md) — narrative
  walkthrough (start here on first read).
- [`../aks-overlay/`](../aks-overlay/) — Kustomize overlay applied
  by the CD pipeline against this cluster.
- [`../../terraform/`](../../terraform/) — the older PostgreSQL +
  Service Bus + Redis + ACR Terraform (different target — fully
  Azure-hosted backend).
