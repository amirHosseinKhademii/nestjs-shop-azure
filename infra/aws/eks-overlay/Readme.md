# EKS demo overlay

Deploys this monorepo onto a vanilla EKS cluster behind an `ingress-nginx`
Classic ELB. Ingress-nginx is the **only** public surface — `web` and
`api-gateway` are both `ClusterIP`, exactly as in production.

```
browser ──► AWS ELB ──► ingress-nginx ─┬─► /        web        (SPA)
                                       └─► /graphql api-gateway (NestJS)
```

The overlay differs from `infra/k8s/` (production base) in three places:

1. Drops `tls:` + `cert-manager.io/cluster-issuer` (no ACME on a raw ELB
   hostname).
2. Drops the `host:` rule so any DNS pointing at the ELB matches.
3. Flips `ssl-redirect` / `force-ssl-redirect` / `hsts` off.

Deployment is triggered automatically by the `CD` workflow when CI passes
on `main`. See [Continuous deployment](#continuous-deployment) for the
flow and required GitHub Secrets.

---

## One-time bootstrap (cluster + tooling)

### 1. Tools on whatever machine runs the bootstrap

These commands match what was used to bring up the demo cluster from a
fresh Amazon Linux 2023 EC2 (any Linux box with the AWS CLI configured
will work just as well):

```bash
# kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl && sudo mv kubectl /usr/local/bin/

# eksctl
ARCH=amd64
PLATFORM=$(uname -s)_$ARCH
curl -sLO "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_$PLATFORM.tar.gz"
tar -xzf eksctl_$PLATFORM.tar.gz -C /tmp && rm eksctl_$PLATFORM.tar.gz
sudo mv /tmp/eksctl /usr/local/bin/

# helm
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Sanity check
kubectl version --client && eksctl version && helm version
```

### 2. AWS CLI configured

```bash
aws configure get region            # e.g. eu-west-1
aws sts get-caller-identity         # confirm it returns *your* IAM user / role
```

### 3. Create the EKS cluster

`t3.small × 2` is the cheapest combo that fits the whole stack (~$0.05/hr
total + ELB + EKS control plane $0.10/hr). Provisioning takes ~14 min.

```bash
eksctl create cluster \
  --name shop-demo \
  --region eu-west-1 \
  --zones eu-west-1a,eu-west-1b \
  --nodegroup-name workers \
  --node-type t3.small \
  --nodes 2 \
  --nodes-min 2 \
  --nodes-max 2 \
  --managed
```

`eksctl` writes the kubeconfig to `~/.kube/config` automatically. Verify:

```bash
kubectl get nodes        # expect 2 Ready
```

### 4. Install ingress-nginx (Classic ELB)

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.type=LoadBalancer
```

Wait ~2 min for AWS to provision the ELB, then grab its public hostname:

```bash
kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'; echo
# e.g. a4911d87378194aeb82b17ba73077d56-1344009333.eu-west-1.elb.amazonaws.com
```

That hostname is what you open in the browser once the app is deployed.

### 5. Wire CD into the cluster (OIDC + RBAC)

This lets GitHub Actions assume an IAM role and `kubectl apply` to the
cluster — without long-lived AWS access keys ever touching GitHub.

```bash
# 5a. Tell IAM to trust GitHub's OIDC issuer (per AWS account, one-time).
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# 5b. Trust policy for the role — replace OWNER/REPO and ACCOUNT_ID.
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
cat > /tmp/trust.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike":   { "token.actions.githubusercontent.com:sub": "repo:OWNER/REPO:*" }
    }
  }]
}
JSON

aws iam create-role \
  --role-name github-actions-shop-cd \
  --assume-role-policy-document file:///tmp/trust.json

# 5c. The role only needs to describe the EKS cluster (so `aws eks
# update-kubeconfig` can fetch the endpoint + CA cert) — RBAC inside the
# cluster controls everything else.
#
# NOTE: there is no AWS-managed policy that grants `eks:DescribeCluster`
# to a *caller*. The `AmazonEKSClusterPolicy` managed policy is for the
# EKS service role, not for users — attaching it here does nothing.
# Use this inline policy instead.
aws iam put-role-policy \
  --role-name github-actions-shop-cd \
  --policy-name eks-describe-cluster \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["eks:DescribeCluster", "eks:ListClusters"],
      "Resource": "*"
    }]
  }'

# 5d. Map the IAM role to a Kubernetes group.
eksctl create iamidentitymapping \
  --cluster shop-demo --region eu-west-1 \
  --arn arn:aws:iam::${ACCOUNT_ID}:role/github-actions-shop-cd \
  --username github-actions \
  --group system:masters
# ↑ demo only. For prod, bind a least-privilege Role/ClusterRole instead.

# 5e. Print the role ARN — paste it into GitHub.
aws iam get-role --role-name github-actions-shop-cd \
  --query 'Role.Arn' --output text
```

### 6. Set GitHub Secrets / Variables

Repository → Settings → Secrets and variables → Actions:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `EKS_CLUSTER_NAME` | `shop-demo` |
| Variable | `AWS_REGION` | `eu-west-1` |
| Secret | `AWS_ROLE_TO_ASSUME` | the ARN from step 5e |
| Secret | `JWT_SECRET` | `openssl rand -base64 48` |
| Secret | `DATABASE_URL` | Neon Postgres connection string |
| Secret | `MONGO_URI` | Atlas connection string |
| Secret | `REDIS_URL` | Upstash `rediss://…` |
| Secret | `DOCKERHUB_USERNAME` | (already used by docker push job) |
| Secret | `DOCKERHUB_TOKEN` | (already used by docker push job) |

The CD workflow auto-skips the EKS jobs whenever `EKS_CLUSTER_NAME` is
unset, so the pipeline stays green for engineers who only care about
images.

---

## Continuous deployment

```
push to main
   │
   ▼
CI (lint / typecheck / test / build)
   │  on success
   ▼
CD (.github/workflows/cd.yml)
   ├── docker            push images tagged sha-<7> + latest
   ├── update-manifests  kustomize edit set image …:sha-<…> + commit
   ├── seed-secrets      OIDC → kubectl apply Secret (idempotent)
   └── deploy-eks        OIDC → kubectl apply -k infra/aws/eks-overlay/
                         + wait for rollout + print ELB hostname
```

A green CD run = the new tag is in the cluster and the Pods are Ready.

---

## Manual deploy (no CD)

If you skipped step 5/6 and just want to apply the overlay from your
laptop:

```bash
# Secrets first (gitignored, fill in real values)
cp infra/k8s/secrets.example.yaml infra/k8s/secrets.yaml
kubectl apply -f infra/k8s/secrets.yaml

# App
kubectl apply -k infra/aws/eks-overlay/

# Watch the rollout
kubectl -n shop rollout status deployment/api-gateway
kubectl -n shop rollout status deployment/web

# Public URL
kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='http://{.status.loadBalancer.ingress[0].hostname}'; echo
```

---

## Teardown (do this when you're done — AWS bills by the minute)

```bash
# 1. Drop the app + the ingress controller (releases the ELB).
kubectl delete -k infra/aws/eks-overlay/   --ignore-not-found
helm uninstall ingress-nginx -n ingress-nginx
kubectl delete namespace ingress-nginx     --ignore-not-found

# 2. Delete the cluster (removes nodes, control plane, VPC, NAT GW).
eksctl delete cluster --name shop-demo --region eu-west-1 --wait

# 3. Optional — remove the CI/CD IAM role + OIDC provider if you're done
# with the demo entirely.
aws iam delete-role-policy \
  --role-name github-actions-shop-cd \
  --policy-name eks-describe-cluster
aws iam delete-role --role-name github-actions-shop-cd
# (leave the OIDC provider in place — it's reusable across repos and free)

# 4. Sanity check no orphaned ELBs / NAT GWs / EBS volumes are still
# billing you.
aws elb   describe-load-balancers     --region eu-west-1 \
  --query 'LoadBalancerDescriptions[].LoadBalancerName'
aws ec2   describe-nat-gateways       --region eu-west-1 \
  --filter 'Name=state,Values=available' \
  --query 'NatGateways[].NatGatewayId'
aws ec2   describe-volumes            --region eu-west-1 \
  --filters 'Name=status,Values=available' \
  --query 'Volumes[].VolumeId'
```

If any of those return non-empty after `eksctl delete cluster` finishes,
delete them by hand — `eksctl` is normally thorough but a stuck CFN
stack can leave a NAT GW behind ($0.045/hr).

---

## Where each piece lives

| Cloud | Overlay | Readme |
| --- | --- | --- |
| AWS / EKS | [`infra/aws/eks-overlay/kustomization.yaml`](./kustomization.yaml) | this file |
| Azure / AKS | [`infra/azure/aks-overlay/kustomization.yaml`](../../azure/aks-overlay/kustomization.yaml) | [`infra/azure/aks-overlay/Readme.md`](../../azure/aks-overlay/Readme.md) |
| Production base | [`infra/k8s/kustomization.yaml`](../../k8s/kustomization.yaml) | [`infra/k8s/README.md`](../../k8s/README.md) |
| Local Minikube | [`k8s-local/`](../../../k8s-local/) | [`k8s-local/README.md`](../../../k8s-local/README.md) |
