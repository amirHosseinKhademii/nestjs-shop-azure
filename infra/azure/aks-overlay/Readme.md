# AKS demo overlay

The Azure equivalent of [`infra/aws/eks-overlay/`](../../aws/eks-overlay/Readme.md).
Same topology, same security model, same `kubectl apply -k` workflow —
only the cloud-specific bits change.

> **First time on Azure?** Read [`azure-guide.md`](../../../azure-guide.md)
> at the repo root first. It walks from "I just signed up to Azure" all
> the way to a live URL, including the GitHub Actions wiring this
> overlay assumes is already in place.
>
> **Prefer Terraform?** [`infra/azure/terraform/`](../terraform/)
> provisions the resource group + AKS cluster + App Registration +
> federated credentials + RBAC in one `terraform apply`.

```
browser ──► Azure LB ──► ingress-nginx ─┬─► /        web        (SPA)
                                        └─► /graphql api-gateway (NestJS)
```

## AWS → Azure cheat sheet

If you've already read the EKS readme, here's the one-line mapping:

| Concept | AWS / EKS | Azure / AKS |
| --- | --- | --- |
| CLI | `aws` | `az` |
| Cluster CLI | `eksctl` | `az aks` (built into `az`) |
| Cluster | EKS | AKS |
| Public LB | ELB (Classic) | Azure Load Balancer |
| Container registry | ECR / Docker Hub | ACR / Docker Hub |
| Object storage | S3 | Azure Blob Storage |
| Secrets store | AWS Secrets Manager | Azure Key Vault |
| CI auth (no static keys) | OIDC → IAM Role | Workload Identity Federation → Service Principal |
| Cluster RBAC binding | `eksctl create iamidentitymapping` | Azure RBAC role assignment + `az aks` AAD integration |
| GH Actions auth task | `aws-actions/configure-aws-credentials@v4` | `azure/login@v2` |
| Kubeconfig fetch | `aws eks update-kubeconfig` | `az aks get-credentials` |
| Identity check | `aws sts get-caller-identity` | `az account show` |
| ADO equivalent of GH OIDC | n/a | "Azure Resource Manager" Service Connection (workload identity) |

---

## One-time bootstrap (cluster + tooling)

### 1. Tools

```bash
# Azure CLI (Linux / WSL)
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# kubectl (az can also install it via `az aks install-cli`)
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl && sudo mv kubectl /usr/local/bin/

# helm
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

az version && kubectl version --client && helm version
```

### 2. Sign in + pick a subscription

```bash
az login
az account list --output table
az account set --subscription "<SUBSCRIPTION_ID_OR_NAME>"
az account show
```

### 3. Create the resource group + AKS cluster

`Standard_B2s × 2` is the cheapest combo that fits the whole stack
(~$0.04/hr per node). Provisioning takes ~5 min — much faster than EKS
because there's no separate control-plane stack to wait on.

```bash
RG=shop-demo-rg
LOC=westeurope
CLUSTER=shop-demo

az group create --name "$RG" --location "$LOC"

az aks create \
  --resource-group "$RG" \
  --name "$CLUSTER" \
  --location "$LOC" \
  --node-count 2 \
  --node-vm-size Standard_B2s \
  --enable-managed-identity \
  --enable-oidc-issuer \
  --enable-workload-identity \
  --network-plugin azure \
  --generate-ssh-keys
```

> `--enable-oidc-issuer` + `--enable-workload-identity` are the bits that
> make the no-static-keys CI flow possible later. Skipping them today =
> recreating the cluster tomorrow when you wire up CD.

Pull the kubeconfig:

```bash
az aks get-credentials --resource-group "$RG" --name "$CLUSTER"
kubectl get nodes        # expect 2 Ready
```

### 4. Install ingress-nginx (Azure LB)

Same Helm install as on EKS — only the underlying LB type changes
(Azure provisions a Standard SKU LB with a public IPv4 address):

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.type=LoadBalancer
```

Wait ~2 min for Azure to provision the public IP, then read it:

```bash
kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}'; echo
# e.g. 20.86.34.117
```

That IP is what you open in the browser. For convenience use
`http://<ip>.nip.io` so you get a hostname (helps avoid the SAN warning
some browsers throw on bare IPs).

### 5a. CI auth — GitHub Actions → AKS (Workload Identity Federation)

Same idea as the EKS OIDC role: GitHub gets a short-lived OIDC token,
Azure exchanges it for an access token for a Service Principal, no
client secret ever leaves Azure.

```bash
SUB=$(az account show --query id -o tsv)
TENANT=$(az account show --query tenantId -o tsv)
APP_NAME=github-actions-shop-cd
REPO=OWNER/REPO            # ← edit me

# 5a.1 Create the App Registration + a Service Principal for it.
APP_ID=$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)
az ad sp create --id "$APP_ID"

# 5a.2 Federated credential — trusts GitHub OIDC tokens for THIS repo's main branch.
cat > /tmp/fic.json <<JSON
{
  "name": "${APP_NAME}-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:${REPO}:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"],
  "description": "GitHub Actions main-branch CD"
}
JSON
az ad app federated-credential create --id "$APP_ID" --parameters @/tmp/fic.json

# 5a.3 Grant the SP just enough Azure RBAC.
SP_ID=$(az ad sp show --id "$APP_ID" --query id -o tsv)
AKS_ID=$(az aks show -g "$RG" -n "$CLUSTER" --query id -o tsv)

# Lets the SP fetch kubeconfig.
az role assignment create \
  --assignee-object-id "$SP_ID" --assignee-principal-type ServicePrincipal \
  --role "Azure Kubernetes Service Cluster User Role" --scope "$AKS_ID"

# Demo-only: full kubectl rights via Azure RBAC. Tighten for prod.
az role assignment create \
  --assignee-object-id "$SP_ID" --assignee-principal-type ServicePrincipal \
  --role "Azure Kubernetes Service RBAC Cluster Admin" --scope "$AKS_ID"

# 5a.4 Print what you'll paste into GitHub.
echo "AZURE_CLIENT_ID    = $APP_ID"
echo "AZURE_TENANT_ID    = $TENANT"
echo "AZURE_SUBSCRIPTION = $SUB"
```

In GitHub → Settings → Secrets and variables → Actions, add:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `AKS_CLUSTER_NAME` | `shop-demo` |
| Variable | `AKS_RESOURCE_GROUP` | `shop-demo-rg` |
| Variable | `AZURE_TENANT_ID` | from above |
| Variable | `AZURE_SUBSCRIPTION_ID` | from above |
| Secret | `AZURE_CLIENT_ID` | the App ID from 5a.4 (technically not secret, but we keep it private to make rotation easier) |
| Secret | `JWT_SECRET` | `openssl rand -base64 48` |
| Secret | `DATABASE_URL` | Neon Postgres |
| Secret | `MONGO_URI` | Atlas |
| Secret | `REDIS_URL` | Upstash |

> The GH Actions side does NOT have an AKS deploy job today — only the
> EKS one. To wire it up, copy `seed-secrets` + `deploy-eks` from
> [`.github/workflows/cd.yml`](../../../.github/workflows/cd.yml),
> swap `aws-actions/configure-aws-credentials@v4` for
> `azure/login@v2` (with `client-id`/`tenant-id`/`subscription-id`),
> and swap `aws eks update-kubeconfig` for
> `az aks get-credentials -g $AKS_RESOURCE_GROUP -n $AKS_CLUSTER_NAME`.

### 5b. CI auth — Azure DevOps → AKS (Service Connection)

Azure DevOps doesn't use GitHub OIDC; it uses **Service Connections**
that wrap either a Service Principal (with secret/cert) or — preferred,
new in 2024 — a Workload Identity Federation principal that ADO mints
on the fly. Both are managed via the ADO UI; from the CLI:

```bash
# Easiest: let ADO create the SP for you.
# Project Settings → Service connections → New service connection
#   → "Azure Resource Manager"
#   → "Workload Identity federation (automatic)"   ← preferred
#   → Scope to your subscription, then to resource group $RG
#   → Name it: shop-aks-sc

# Or pre-create one with a client secret you control:
az ad sp create-for-rbac \
  --name "shop-aks-sc" \
  --role "Azure Kubernetes Service RBAC Cluster Admin" \
  --scopes "$AKS_ID" \
  --sdk-auth                      # outputs JSON you paste into ADO
```

Then add **Pipeline variables** (Library → Variable groups, or pipeline
UI):

| Variable | Value |
| --- | --- |
| `AZURE_SUBSCRIPTION` | the **service connection name** (`shop-aks-sc`) |
| `AKS_CLUSTER_NAME` | `shop-demo` |
| `AKS_RESOURCE_GROUP` | `shop-demo-rg` |
| `JWT_SECRET` | `openssl rand -base64 48`, marked **secret** |
| `DATABASE_URL` | Neon, marked **secret** |
| `MONGO_URI` | Atlas, marked **secret** |
| `REDIS_URL` | Upstash, marked **secret** |

The Azure DevOps CD pipeline ([`azure-pipelines-cd.yml`](../../../azure-pipelines-cd.yml))
already includes `SeedSecrets` and `Deploy` stages that consume these
variables. They auto-skip when `AKS_CLUSTER_NAME` is unset (same gating
pattern as the GH Actions side).

---

## Continuous deployment

### Azure DevOps flow

```
push to main
   │
   ▼
azure-pipelines-ci.yml (Format / Verify / Build)
   │  on success → resources.pipelines.shop-ci trigger
   ▼
azure-pipelines-cd.yml
   ├── Docker          push images tagged sha-<7> + latest
   ├── UpdateManifests kustomize edit set image …:sha-<…> + commit
   ├── SeedSecrets     az login → kubectl apply Secret (idempotent)
   └── Deploy          az login → kubectl apply -k infra/azure/aks-overlay/
                       + wait for rollout + print public IP
```

### GitHub Actions flow (Azure-targeted)

Identical job graph as the EKS pipeline, but with `azure/login@v2`
instead of `aws-actions/configure-aws-credentials@v4`. See note in
section 5a above.

---

## Manual deploy (no CD)

```bash
# Secrets first (gitignored, fill in real values)
cp infra/k8s/secrets.example.yaml infra/k8s/secrets.yaml
kubectl apply -f infra/k8s/secrets.yaml

# App
kubectl apply -k infra/azure/aks-overlay/

# Watch the rollout
kubectl -n shop rollout status deployment/api-gateway
kubectl -n shop rollout status deployment/web

# Public URL
kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='http://{.status.loadBalancer.ingress[0].ip}'; echo
```

---

## Teardown (do this when you're done — Azure bills by the second)

```bash
# 1. Drop the app + ingress controller (releases the public IP).
kubectl delete -k infra/azure/aks-overlay/  --ignore-not-found
helm uninstall ingress-nginx -n ingress-nginx
kubectl delete namespace ingress-nginx       --ignore-not-found

# 2. Delete the entire resource group — kills cluster, NICs, disks, LB,
#    public IP, route tables in one shot.
az group delete --name "$RG" --yes --no-wait

# 3. Optional — remove the CI/CD App Registration if you're done.
az ad app delete --id "$APP_ID"

# 4. Sanity check no orphaned resources are still in the subscription.
az resource list --resource-group "$RG" --output table  # expect "ResourceGroupNotFound"
```

`az group delete` is much cleaner than its AWS counterpart — there's no
NAT-GW-stuck-behind situation because Azure doesn't have NAT Gateways
in this default networking mode (it's all kubenet over a Standard LB).

---

## Where each piece lives

| Cloud | Overlay | Readme |
| --- | --- | --- |
| AWS / EKS | [`infra/aws/eks-overlay/kustomization.yaml`](../../aws/eks-overlay/kustomization.yaml) | [`infra/aws/eks-overlay/Readme.md`](../../aws/eks-overlay/Readme.md) |
| Azure / AKS | [`infra/azure/aks-overlay/kustomization.yaml`](./kustomization.yaml) | this file |
| Production base | [`infra/k8s/kustomization.yaml`](../../k8s/kustomization.yaml) | [`infra/k8s/README.md`](../../k8s/README.md) |
| Local Minikube | [`k8s-local/`](../../../k8s-local/) | [`k8s-local/README.md`](../../../k8s-local/README.md) |
