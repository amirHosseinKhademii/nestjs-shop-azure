# Production Kubernetes manifests

These are the **registry-backed** manifests intended for real clusters
(staging / production). They pull images from Docker Hub via tags written
into `kustomization.yaml` by CI on every push to `main` (and on `v*.*.*`
release tags).

For **local minikube** use the manifests under [`k8s-local/`](../../k8s-local/)
instead — they use `imagePullPolicy: Never` with images loaded via
`minikube image load`.

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

## How image tags get into these manifests

```
push to main
   │
   ▼
GitHub Actions
   ├── verify  → lint, typecheck, test     (per service)
   ├── build   → tsc / nest build           (per service)
   ├── docker  → docker buildx build & push (per service)
   │              tags pushed:
   │                amir2575/shop-<svc>:sha-<7-char-sha>   ← immutable
   │                amir2575/shop-<svc>:main               ← branch
   │                amir2575/shop-<svc>:latest             ← default branch
   │
   └── update-manifests
                ├── kustomize edit set image …:sha-<…>
                └── git commit + push to main   (loop-safe; GITHUB_TOKEN
                                                 pushes don't re-trigger CI)
```

The committed change is in `kustomization.yaml`'s `images:` block — the raw
deployment YAMLs themselves are never touched, so PR diffs stay focused on
real config changes.

## Apply order

```bash
# Once: prep the ingress-nginx namespace label (only if missing).
kubectl label namespace ingress-nginx kubernetes.io/metadata.name=ingress-nginx --overwrite

# Once: create the shared Secret.
cp secrets.example.yaml secrets.yaml      # then edit; gitignored
kubectl apply -f secrets.yaml

# Apply the whole stack via kustomize (uses the CI-bumped image tags):
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
