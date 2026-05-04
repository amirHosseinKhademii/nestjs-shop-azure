# AWS EKS cheat sheet — Terraform to live URL in one page

A reference card for the **AWS / EKS Terraform module** in this repo. Use this when you want to *do* something. For *why* it's built this way, the 15-phase walkthrough, and the failure-by-failure troubleshooting log, read [`infra/terraform/aws/README.md`](../infra/terraform/aws/README.md).

---

## 1. The infrastructure at a glance

```
                          Internet
                              │
                       ┌──────┴──────┐
                       │ Internet GW │  (single, attached to VPC)
                       └──────┬──────┘
   ┌─────────────────────────┼─────────────────────────┐
   │              VPC 10.42.0.0/16                     │
   │                                                   │
   │  Public  10.42.0.0/20      Public  10.42.16.0/20  │
   │  ┌──────────────────┐      ┌──────────────────┐   │
   │  │ NAT Gateway      │      │ NLB ENI (AZ-b)   │   │
   │  │ NLB ENI (AZ-a)   │      │  → ingress-nginx │   │
   │  └────────┬─────────┘      └────────┬─────────┘   │
   │           │ NAT egress              │             │
   │           ▼                         ▼             │
   │  Private 10.42.128.0/20    Private 10.42.144.0/20 │
   │  ┌──────────────────┐      ┌──────────────────┐   │
   │  │ Worker EC2 #1    │      │ Worker EC2 #2    │   │
   │  │  t3.medium       │      │  t3.medium       │   │
   │  │ EKS ctrl-plane   │      │ EKS ctrl-plane   │   │
   │  │   ENI (AWS-mgd)  │      │   ENI (AWS-mgd)  │   │
   │  │ Pod IPs (vpc-cni)│      │ Pod IPs (vpc-cni)│   │
   │  └──────────────────┘      └──────────────────┘   │
   └───────────────────────────────────────────────────┘
```

**One VPC, two AZs, public + private subnets per AZ, single NAT, public NLB, private workers.**

---

## 2. What this module creates

| # | Resource | Why it's there |
|---|---|---|
| 1 | **VPC** `/16` + 2 public + 2 private subnets + IGW + 1 NAT GW | The network — public for NAT/NLB, private for workers + Pods |
| 2 | **EKS control plane** (1.30, public endpoint) | The Kubernetes API server, AWS-managed multi-AZ |
| 3 | **Managed node group** (2 × `t3.medium`, on-demand, AL2023) | Worker EC2 instances |
| 4 | **EKS add-ons** — coredns, kube-proxy, vpc-cni, eks-pod-identity-agent | Mandatory for a usable cluster |
| 5 | **GitHub OIDC IAM provider** | Lets CI present a JWT instead of long-lived AWS keys |
| 6 | **IAM Role `<cluster>-github-oidc`** | The role CI assumes, locked to your `repo:owner/name` + branches + environment |
| 7 | **EKS Access Entry** mapping the role → `cluster-admin` | Authorises the IAM identity to actually `kubectl apply` |
| 8 | **ingress-nginx via Helm** (provisions an NLB) | Public address for the apps; the deploy job reads it for the "Live URL" |

Plan size: **~50 resources**. Apply time: **15–20 min** (10 of those are EKS control-plane provisioning).

---

## 3. The files you'll edit (full map)

| File | What it does |
|---|---|
| `infra/terraform/aws/providers.tf` | Provider version pins, EKS auth wiring for `kubernetes` + `helm` providers |
| `infra/terraform/aws/variables.tf` | Every knob — region, cluster name, K8s version, VPC CIDR, AZ count, node group sizing, GitHub OIDC settings |
| `infra/terraform/aws/main.tf` | VPC + EKS cluster + managed node group + add-ons + access entry |
| `infra/terraform/aws/iam-cicd.tf` | GitHub OIDC provider + IAM role + trust policy locked to your repo/branch/environment |
| `infra/terraform/aws/ingress.tf` | `ingress-nginx` Helm release (creates the public NLB) |
| `infra/terraform/aws/outputs.tf` | `cluster_name`, `aws_region`, `github_oidc_role_arn`, `kubeconfig_command`, `ingress_nginx_hostname`, `github_setup` block |
| `infra/terraform/aws/terraform.tfvars.example` | Template — `cp` to `terraform.tfvars` and edit |
| `infra/terraform/aws/.gitignore` | Excludes `.terraform/`, `*.tfstate*`, `terraform.tfvars` |
| `infra/aws/eks-overlay/` | Kustomize overlay the `deploy` CI job applies on top of `infra/k8s/` base |
| `.github/actions/aws-eks-kubectl/action.yml` | Composite action: assume role, `aws eks update-kubeconfig`, run any kubectl |
| `.github/workflows/cd.yml` (jobs `seed-secrets-eks`, `deploy`) | The half of CD that targets EKS |

---

## 4. From zero to a live URL — the 8-command minimum

Pre-reqs: AWS account, `aws configure` already done, `gh auth login` already done.

```bash
brew install terraform awscli gh kubectl helm        # 1. tools

cd infra/terraform/aws                                # 2. enter module
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars                              #    set: github_repo = "owner/repo"

terraform init                                        # 3. ~30 s
terraform apply -auto-approve                         # 4. ~15–20 min  ← the slow one

$(terraform output -raw kubeconfig_command)           # 5. local kubectl points at EKS
kubectl get nodes                                     #    expect 2 Ready, no EXTERNAL-IP

terraform output -raw github_setup | bash             # 6. set 2 GH Variables + 1 GH Secret
#  Repo → Settings → Environments → New: production-eks   ← create once in UI

git commit --allow-empty -m "deploy" && git push      # 7. triggers CI; ~10 min
URL=$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
        -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
curl -sI "http://$URL/health/ready"                   # 8. expect HTTP/1.1 200 OK
```

**Total: ~50 minutes**, ~25 of which is `terraform apply` + first CI run; the rest is one-time setup.

---

## 5. Network topology + security groups (one-glance reference)

| Component | Subnet | Why |
|---|---|---|
| NAT Gateway | Public | Needs Elastic IP + IGW route to talk to the internet |
| NLB (ingress-nginx Service) | Public (`aws-load-balancer-scheme: internet-facing`) | Browsers must reach it |
| Worker EC2 instances | **Private** | Never directly reachable from the internet; egress via NAT |
| Pod IPs (vpc-cni) | **Private** (allocated from the node's subnet CIDR) | Pods are first-class VPC citizens with real routable IPs |
| EKS control-plane API | AWS's own VPC, but managed ENIs in **your private subnets** | Decouples HA from your VPC; nodes call API via the ENIs |
| EKS API public endpoint | Reachable over public internet (`cluster_endpoint_public_access = true`) | So `kubectl` from your laptop and GitHub Actions works without a bastion |

| Security group (auto-created by the EKS module) | Default ingress | Default egress |
|---|---|---|
| **Cluster SG** `eks-cluster-sg-<cluster>-…` | All TCP from the **node SG** | All |
| **Node SG** `<cluster>-node-…` | TCP 1025–65535 from cluster SG (kubelet ↔ apiserver), all from itself (pod-to-pod), 53 UDP/TCP for DNS | All |
| **NLB SG** (auto-managed by AWS) | `0.0.0.0/0:80` and `:443` | All — forwards to worker NodePort range |

You don't need to touch any of these. To audit after apply, see [§9 Verify](#9-verify-each-layer).

---

## 6. CI/CD wiring (3 GitHub items + 1 environment)

After `terraform apply`, copy-paste the block Terraform printed:

```bash
terraform output -raw github_setup
```

That outputs three `gh` commands plus a verification step. They set:

| Type | Name | Value |
|---|---|---|
| Repository **Variable** | `EKS_CLUSTER_NAME` | `terraform output -raw cluster_name` |
| Repository **Variable** | `AWS_REGION` | `terraform output -raw aws_region` |
| Repository **Secret** | `AWS_ROLE_TO_ASSUME` | `terraform output -raw github_oidc_role_arn` |

Then **once in the GitHub UI** — Settings → Environments → New environment → name **`production-eks`** (must match exactly; the IAM trust policy is locked to this string). Optionally add yourself as a Required Reviewer for a click-to-approve gate.

The `if: vars.EKS_CLUSTER_NAME != ''` gate at line 362 of `cd.yml` activates the moment `EKS_CLUSTER_NAME` is set.

---

## 7. Daily operator commands

```bash
cd infra/terraform/aws

terraform plan                                         # preview drift
terraform apply                                        # apply edits to .tfvars or .tf
terraform output                                       # show all outputs
terraform output -raw kubeconfig_command               # one specific output

aws sts get-caller-identity                            # who am I to AWS?
aws eks update-kubeconfig --name $(terraform output -raw cluster_name) \
                          --region $(terraform output -raw aws_region)

kubectl config current-context                         # what cluster am I pointed at?
kubectl get nodes -o wide                              # 2 Ready, no EXTERNAL-IP
kubectl get pods -A                                    # everything Running / Completed
kubectl -n shop get deploy,svc,pods                    # the app
kubectl -n ingress-nginx get svc ingress-nginx-controller    # the NLB

# Live URL
URL=$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
        -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "http://$URL"

# Tail an app
kubectl -n shop logs -f -l app=api-gateway --tail=100

# Roll a deployment after pushing a new image
kubectl -n shop rollout restart deploy/shop-svc
kubectl -n shop rollout status  deploy/shop-svc

# Inspect what AWS actually built
aws eks describe-cluster      --name $(terraform output -raw cluster_name) --region $(terraform output -raw aws_region)
aws eks describe-nodegroup    --cluster-name $(terraform output -raw cluster_name) --nodegroup-name default --region $(terraform output -raw aws_region)
```

---

## 8. Day-2 operations — copy-paste edits

Each block is a snippet you drop into `terraform.tfvars` (or `main.tf` where noted), then `terraform apply`.

### Resize the node group

```hcl
# terraform.tfvars
node_instance_type = "t3.large"
node_desired_size  = 3
node_max_size      = 6
```

Rolling replacement, ~3 min per node, no downtime if `replicas >= 2`.

### Switch to spot instances (≈ 50% cheaper)

```hcl
# main.tf, eks_managed_node_groups.default
capacity_type  = "SPOT"
instance_types = ["t3.medium", "t3a.medium", "t2.medium"]   # multiple = better availability
```

Spot nodes get a **2-min termination notice**. Pair with a `PodDisruptionBudget` to survive evictions.

### Restrict the Kubernetes API to known IPs

```hcl
# main.tf, module "eks"
cluster_endpoint_public_access       = true
cluster_endpoint_public_access_cidrs = ["203.0.113.0/24", "192.0.2.50/32"]
```

> GitHub Actions runners' IPs change — if you do this, either allow all of GitHub's CIDRs from `https://api.github.com/meta`, or use a self-hosted runner inside the VPC.

### Tighten the EKS access entry to a Namespace scope

```hcl
# main.tf, module "eks"
access_entries = {
  github_actions = {
    principal_arn = aws_iam_role.github_oidc.arn
    type          = "STANDARD"
    policy_associations = {
      shop_only = {
        policy_arn = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy"
        access_scope = { type = "namespace", namespaces = ["shop", "ingress-nginx", "observability"] }
      }
    }
  }
}
```

### Add a branch / GitHub Environment that may deploy

```hcl
# terraform.tfvars
github_branches     = ["main", "release/*"]
github_environments = ["production-eks", "staging-eks"]
```

`terraform apply` updates only the IAM trust policy — cluster untouched.

### Roll out a new Kubernetes minor version

```hcl
# terraform.tfvars
kubernetes_version = "1.31"
```

Control-plane upgrade in place (~10 min, no downtime), then nodes cordon/drain/replace (~3 min each). Always check release notes first.

---

## 9. Verify each layer

```bash
CLUSTER=$(terraform output -raw cluster_name)
REGION=$(terraform output -raw aws_region)

# Subnets — 2 public + 2 private with the right tags
VPC_ID=$(aws eks describe-cluster --name "$CLUSTER" --region "$REGION" \
  --query 'cluster.resourcesVpcConfig.vpcId' --output text)
aws ec2 describe-subnets --region "$REGION" --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[].{AZ:AvailabilityZone,CIDR:CidrBlock,Public:MapPublicIpOnLaunch}' --output table

# Worker nodes are in PRIVATE subnets only — PublicIP must be empty
aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:eks:cluster-name,Values=$CLUSTER" \
  --query 'Reservations[].Instances[].{ID:InstanceId,PrivateIP:PrivateIpAddress,PublicIP:PublicIpAddress}' --output table

# Auto-created security groups — should see eks-cluster-sg + node SG
aws ec2 describe-security-groups --region "$REGION" \
  --filters "Name=tag:kubernetes.io/cluster/$CLUSTER,Values=owned" \
  --query 'SecurityGroups[].[GroupId,GroupName]' --output table

# NLB is reachable
URL=$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
        -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
dig +short "$URL"                              # expect 2 public IPs (one per AZ)
curl -sI "http://$URL/health/ready"            # expect HTTP/1.1 200 OK
curl -s -X POST "http://$URL/graphql" \
     -H 'Content-Type: application/json' \
     -d '{"query":"{ __typename }"}'           # expect {"data":{"__typename":"Query"}}

# CI / IAM trust path
aws iam get-role --role-name "$CLUSTER-github-oidc" --query 'Role.AssumeRolePolicyDocument' --output json
```

---

## 10. Top errors → 1-line fix

| You see this | Fix |
|---|---|
| `terraform apply` → `EntityAlreadyExists ... oidc-provider/token.actions.githubusercontent.com` | Account already has the GitHub OIDC provider — set `create_oidc_provider = false` in `terraform.tfvars`, re-apply |
| `terraform apply` → `InvalidParameterException: Subnet ... is not in any of the AZs supported by EKS` | Pick a different region (try `eu-west-1` or `us-east-1`) — EKS isn't in every AZ of every region |
| `terraform apply` → `UnauthorizedOperation` on any AWS call | Your IAM principal lacks permissions — use `AdministratorAccess` for bootstrap |
| `terraform apply` hangs >25 min on EKS control plane | Wait the full AWS timeout (~25 min). **Never Ctrl-C mid-apply** — state corruption risk |
| CI `deploy` job → `Could not assume role with OIDC` | Trust policy mismatch — add the branch/env to `github_branches` / `github_environments` and re-apply |
| CI `deploy` job → `kubectl apply` returns `forbidden` | EKS access entry didn't apply — confirm `module.eks.access_entries.github_actions` exists, re-apply |
| `kubectl get nodes` empty after >5 min | Node group bootstrap failed — `aws eks describe-nodegroup --cluster-name $CLUSTER --nodegroup-name default` and check `health.issues[]` |
| `helm_release.ingress_nginx` times out | Cluster has no schedulable nodes yet — `kubectl describe pods -n kube-system` to find why pods are Pending |
| `terraform output ingress_nginx_hostname` empty right after apply | NLB needs 60–90 s to get a public DNS name — `terraform refresh && terraform output` after a minute |
| `curl http://$URL/` hangs after a successful deploy | NLB health checks haven't gone green yet (60–90 s warm-up across both AZs) — wait, retry |
| `terraform destroy` → `DependencyViolation` on the VPC | Something *outside* Terraform created an ENI (manual LB, leftover RDS) — VPC console → Network Interfaces → filter by VPC ID, delete it, retry destroy |
| `terraform destroy` → `OIDCProviderInUse` | Another stack in the account still references it — `create_oidc_provider = false` on the *other* stacks first |
| `terraform destroy` hangs on cluster delete | Add-ons may need explicit deletion — `aws eks list-addons` then `aws eks delete-addon` per add-on, retry |

---

## 11. Cost cheat sheet

Monthly cost while the cluster runs 24/7 in `eu-west-1` (on-demand, May 2026):

| Component | Hourly | Monthly |
|---|---:|---:|
| EKS control plane | $0.10 | ~$72 |
| 2 × t3.medium worker nodes | $0.0832 | ~$60 |
| 1 × NAT Gateway (single-NAT mode) | $0.045 | ~$33 |
| 1 × NLB (ingress-nginx) | $0.0225 | ~$16 |
| EBS gp3 root volumes (2 × 20 GiB) | — | ~$3 |
| Data egress | varies | ~$0–$5 demo |
| **Total** | **≈ $0.25** | **≈ $185** |

Knock it down by:

- `terraform destroy` when not actively demoing (control plane is pay-per-hour).
- `capacity_type = "SPOT"` in `main.tf` — halves node cost.
- `node_desired_size = 1` for a single-user demo.
- Switch region (`eu-north-0` / `us-east-1` are cheaper).

---

## 12. Teardown — stop paying

```bash
cd infra/terraform/aws
terraform destroy                         # ~15 min, deletes in dependency order

# Also delete the GitHub Variables/Secret so a stray push doesn't try to deploy
gh variable delete EKS_CLUSTER_NAME    --repo "$GITHUB_REPO"
gh variable delete AWS_REGION          --repo "$GITHUB_REPO"
gh secret   delete AWS_ROLE_TO_ASSUME  --repo "$GITHUB_REPO"
```

Order Terraform destroys in: ingress-nginx (deletes NLB → frees public IP) → node group → EKS cluster → add-ons → NAT GW (releases EIP) → subnets/RT/IGW/VPC → IAM role + OIDC provider.

---

## 13. Where to go next

- **Why each Terraform decision was made + 15-phase walkthrough** → [`infra/terraform/aws/README.md`](../infra/terraform/aws/README.md)
- **What the kustomize overlay does on top of the base manifests** → [`infra/aws/eks-overlay/Readme.md`](../infra/aws/eks-overlay/Readme.md)
- **AKS equivalent (same structure)** → [`infra/azure/terraform/README.md`](../infra/azure/terraform/README.md) (Terraform), [`infra/azure/aks-overlay/azure-guide.md`](../infra/azure/aks-overlay/azure-guide.md) (full guide)
- **Deploy the observability stack on top** → [`docs/observability-cheatsheet.md`](./observability-cheatsheet.md)
- **CI/CD job graph and what each job does** → [`.github/workflows/cd.yml`](../.github/workflows/cd.yml)
