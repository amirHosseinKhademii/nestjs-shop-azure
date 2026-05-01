# Production Kubernetes manifests

These are the **registry-backed** manifests intended for real clusters
(staging / production). They pull images from Docker Hub via tags written
into `kustomization.yaml` by CI on every push to `main` (and on `v*.*.*`
release tags).

| You want to deploy to… | Use… |
| --- | --- |
| Local Minikube | [`k8s-local/`](../../k8s-local/) — `imagePullPolicy: Never`, images loaded via `minikube image load` |
| AWS EKS demo | [`infra/aws/eks-overlay/`](../aws/eks-overlay/Readme.md) — same base, no TLS / cert-manager / host rule |
| Azure AKS demo | [`infra/azure/aks-overlay/`](../azure/aks-overlay/Readme.md) — same base, no TLS / cert-manager / host rule |
| Real production | this directory directly — requires cert-manager, real DNS, etc. |

## Trust model

```
Internet
   │  HTTPS only (HTTP→HTTPS redirect, HSTS preload)
   ▼
ingress-nginx                     ← only thing public
   ├── /            ──▶ web         (static SPA, nginx-unprivileged :8080)
   └── /graphql     ──▶ api-gateway (NestJS GraphQL :3000)

api-gateway          ──▶ user-svc :3001
                     ──▶ shop-svc :3002
                     ──▶ order-svc :3003

shop-svc             ──▶ order-svc :3003   (HTTP checkout fallback)

{user,shop,order}-svc ──▶ public internet (Neon / Atlas / Upstash / Service Bus)
```

Nothing else can talk to anything else. Enforced by:

1. **ClusterIP Services** for every workload — no `LoadBalancer` / `NodePort`.
2. **Ingress** only routes `/` and `/graphql`; backend services have no Ingress rule.
3. **NetworkPolicy** (`network-policies.yaml`) defaults to deny-all and only the
   listed flows are allowed. Requires a CNI that enforces NetworkPolicy
   (Cilium / Calico — on AKS use `--network-plugin azure --network-policy cilium`).
4. **Pod Security Standards** (namespace label
   `pod-security.kubernetes.io/enforce: restricted`). Pods that try to run as
   root, keep capabilities, mount the host filesystem, etc. are rejected by the
   API server.
5. **Per-pod `securityContext`**: `runAsNonRoot`, dropped capabilities, read-only
   root filesystem, `seccompProfile: RuntimeDefault`,
   `automountServiceAccountToken: false`.

## Prerequisites

- Cluster with a CNI that enforces NetworkPolicy (Cilium / Calico).
- [`ingress-nginx`](https://kubernetes.github.io/ingress-nginx/) installed
  (the controller's namespace **must** carry the
  `kubernetes.io/metadata.name=ingress-nginx` label — set automatically since
  Kubernetes 1.22; otherwise add it manually).
- [`cert-manager`](https://cert-manager.io/) with a `ClusterIssuer` named
  `letsencrypt` (or replace the `tls` block in `ingress.yaml` with your own
  Secret).
- A DNS A/AAAA record for `shop.example.com` pointing at the ingress LB.
- Docker Hub repository for each service (`amir2575/shop-<service>`), or
  override `vars.DOCKERHUB_NAMESPACE` in repo settings.

## How image tags + secrets get into the cluster

```
push to main
   │
   ▼
GitHub Actions (ci.yml → cd.yml)
   ├── verify  → lint, typecheck, test     (per service)
   ├── build   → tsc / nest build           (per service)
   ├── docker  → docker buildx build & push (per service)
   │              tags pushed:
   │                amir2575/shop-<svc>:sha-<7-char-sha>   ← immutable
   │                amir2575/shop-<svc>:main               ← branch
   │                amir2575/shop-<svc>:latest             ← default branch
   │
   ├── update-manifests
   │            ├── kustomize edit set image …:sha-<…>
   │            └── git commit + push to main   (loop-safe; GITHUB_TOKEN
   │                                             pushes don't re-trigger CI)
   │
   └── seed-secrets  (only runs if vars.EKS_CLUSTER_NAME is set)
                ├── OIDC → assume IAM role in AWS  (no long-lived keys)
                ├── aws eks update-kubeconfig
                ├── kubectl apply namespace.yaml
                └── kubectl apply Secret/shop-app-secrets
                    (built from GitHub Repo Secrets, idempotent
                     via dry-run|apply)
```

`update-manifests` only edits `kustomization.yaml`'s `images:` block — the
raw deployment YAMLs are never touched, so PR diffs stay focused on real
config changes.

## Secrets

`shop-app-secrets` is **never** stored in this repo — not as plaintext,
not encrypted, not anywhere. The Secret is created in-cluster by the
`seed-secrets` job in `.github/workflows/cd.yml` from GitHub Repository
Secrets. Rotation = update the GitHub Secret + re-run the `CD` workflow.

### Required GitHub Repo Secrets / Variables

| Kind | Name | Value | Used by |
| --- | --- | --- | --- |
| Variable | `EKS_CLUSTER_NAME` | e.g. `shop-demo` | Gates the seed-secrets job — leave unset to skip |
| Variable | `AWS_REGION` | e.g. `eu-west-1` | `aws eks update-kubeconfig` |
| Secret | `AWS_ROLE_TO_ASSUME` | IAM role ARN trusted by `token.actions.githubusercontent.com` for this repo | OIDC assume |
| Secret | `DATABASE_URL` | Neon Postgres connection string | `user-svc`, `order-svc` |
| Secret | `MONGO_URI` | Atlas connection string | `shop-svc` |
| Secret | `REDIS_URL` | Upstash `rediss://…` | `shop-svc` cart |
| Secret | `JWT_SECRET` | `openssl rand -base64 48` output | `api-gateway`, `user-svc` |

### One-time AWS setup for OIDC

```bash
# 1. Tell AWS to trust GitHub's OIDC provider (per AWS account, one-time).
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# 2. Create an IAM role with this trust policy (replace OWNER/REPO):
cat > /tmp/trust.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals":  { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike":    { "token.actions.githubusercontent.com:sub": "repo:OWNER/REPO:*" }
    }
  }]
}
JSON
aws iam create-role --role-name github-actions-shop-cd \
  --assume-role-policy-document file:///tmp/trust.json

# 3. Give it just enough perms (EKS describe + cluster RBAC).
aws iam attach-role-policy --role-name github-actions-shop-cd \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy

# 4. Map the role into the cluster's RBAC so kubectl actually works:
eksctl create iamidentitymapping \
  --cluster $EKS_CLUSTER_NAME --region $AWS_REGION \
  --arn arn:aws:iam::ACCOUNT_ID:role/github-actions-shop-cd \
  --username github-actions \
  --group system:masters     # demo only; tighten to a Role binding for prod

# Now copy the role ARN into GitHub Settings → Secrets → AWS_ROLE_TO_ASSUME.
```

### Manual one-off (no CI, no AWS)

For a quick `kubectl apply` from your laptop without going through the
pipeline:

```bash
cp secrets.example.yaml secrets.yaml      # gitignored
# fill in real values
kubectl apply -f secrets.yaml
kubectl apply -k .
```

## Apply order

```bash
# Once: prep the ingress-nginx namespace label (only if missing).
kubectl label namespace ingress-nginx kubernetes.io/metadata.name=ingress-nginx --overwrite

# Apply the whole stack (ingress-nginx required, secret created by CD or
# manual step above):
kubectl apply -k .
```

For continuous delivery, point ArgoCD or Flux at this directory; they'll see
each `update-manifests` commit and roll out the new tag automatically.

## Manual one-off image override

If you ever need to deploy a tag CI hasn't yet committed (hotfix, debugging),
override locally without committing:

```bash
cd infra/k8s
kustomize edit set image docker.io/amir2575/shop-api-gateway=docker.io/amir2575/shop-api-gateway:sha-deadbee
kubectl apply -k .
git checkout kustomization.yaml          # discard the local tag bump
```

Or just do an in-cluster patch (won't survive the next `kubectl apply -k`):

```bash
kubectl -n shop set image deployment/api-gateway \
  api-gateway=docker.io/amir2575/shop-api-gateway:sha-deadbee
```

## Verifying isolation

```bash
# Backend services are ClusterIP only — should NOT have an external IP.
kubectl -n shop get svc

# From inside the namespace, the gateway can reach a backend:
kubectl -n shop run curl --rm -it --restart=Never \
  --image=curlimages/curl --labels app=api-gateway \
  -- curl -sS http://user-svc:3001/health/live

# But web cannot — NetworkPolicy denies it (expect a timeout):
kubectl -n shop run curl --rm -it --restart=Never \
  --image=curlimages/curl --labels app=web \
  -- curl --max-time 3 -sS http://user-svc:3001/health/live ; echo "exit=$?"
```

## Replacing the example placeholders

| Placeholder                            | Replace with                                              |
| -------------------------------------- | --------------------------------------------------------- |
| `amir2575/shop-...`                    | Your registry namespace (or set `vars.DOCKERHUB_NAMESPACE`)|
| `shop.example.com` (in `ingress.yaml`) | Your real DNS hostname                                    |
| `letsencrypt` (cert-manager issuer)    | Your `ClusterIssuer` name                                 |
| Values in `secrets.example.yaml`       | Real connection strings + JWT secret (don't commit them)  |
