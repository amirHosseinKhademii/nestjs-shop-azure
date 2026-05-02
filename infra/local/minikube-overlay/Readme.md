# Minikube overlay

One-shot local Kubernetes deploy of the whole stack to **Minikube**.
Same topology as the production base in [`infra/k8s/`](../../k8s/) and the
cloud overlays ([`infra/aws/eks-overlay/`](../../aws/eks-overlay/) and
[`infra/azure/aks-overlay/`](../../azure/aks-overlay/)) — only the bits that
genuinely differ on a laptop are patched here.

## What's different from production

| Concern | Production / EKS / AKS | Minikube overlay |
| --- | --- | --- |
| Replicas per Deployment | 2 | **1** (fits a 6 GB cluster) |
| Ingress TLS / cert-manager | required | **dropped** (HTTP only) |
| Ingress `host:` rule | `shop.example.com` | **dropped** (any host matches) |
| `imagePullPolicy` | `IfNotPresent` (Hub pulls) | `IfNotPresent` (works for both Hub-pulled and `eval $(minikube docker-env)` builds) |
| Secret seeding | `.github/workflows/cd.yml#seed-secrets` | `./seed-secrets.mjs` (reads root `.env`) |
| NetworkPolicy enforcement | enforced (Cilium / Calico CNI) | inert by default; enable with `--cni=calico` if you want to test it |
| NetworkPolicy egress rules | 443 + storage ports | + `9092` (Redpanda) and `27782` (Aiven Kafka) |

External SaaS deps stay the same — Neon Postgres, MongoDB Atlas, Upstash
Redis, Aiven Kafka — exactly as the cloud overlays use. The only thing
running locally is the cluster + the five app pods.

## Prerequisites

- [`minikube`](https://minikube.sigs.k8s.io/) >= 1.33 (tested with the docker driver)
- `kubectl` (or use `minikube kubectl --` everywhere)
- A populated `.env` at the repo root with the values used by the rest of
  the project — see [`infra/k8s/secrets.example.yaml`](../../k8s/secrets.example.yaml).

## One-time cluster setup

> **Heads-up — `--memory` / `--cpus` are ignored on an existing cluster.**
> If you've ever run `minikube start` before on this machine, the cluster
> already has a fixed sizing baked in and `minikube stop && minikube start
> --memory=…` will *silently* keep the old size (you'll see
> `❗ You cannot change the memory size for an existing minikube cluster`
> in the output). To actually resize, run `minikube delete` first — this
> destroys the cluster's docker container, which is fine because all our
> state is external (Neon / Atlas / Upstash / Aiven).

```bash
# 1. Create / start the cluster (6 GB / 4 cores covers the whole stack
#    comfortably; bump as needed). Add `--cni=calico` if you want
#    NetworkPolicy enforcement. If a previous Minikube cluster exists at a
#    different sizing, run `minikube delete` first (see note above).
minikube start --memory=6g --cpus=4 --driver=docker

# 2. Enable the ingress addon (deploys ingress-nginx into ingress-nginx ns).
minikube addons enable ingress

# 3. (Optional) Label the ingress-nginx namespace so the production
#    NetworkPolicies in infra/k8s/network-policies.yaml select it correctly.
#    Modern Minikube already sets this label automatically.
kubectl label namespace ingress-nginx kubernetes.io/metadata.name=ingress-nginx --overwrite

# 4. Wait for ingress-nginx to be ready before applying the overlay.
kubectl -n ingress-nginx wait --for=condition=ready pod \
  -l app.kubernetes.io/component=controller --timeout=180s
```

## Deploy

From the repo root:

```bash
# 1. Seed the Secret from your local .env (idempotent, re-run any time).
./infra/local/minikube-overlay/seed-secrets.mjs

# 2. Apply the overlay.
kubectl apply -k infra/local/minikube-overlay/

# 3. Wait for everything to roll out.
for d in api-gateway web user-svc shop-svc order-svc; do
  kubectl -n shop rollout status deployment/$d --timeout=180s
done
```

## Open the SPA

The Minikube ingress controller listens on the cluster IP returned by
`minikube ip`. Two equally valid ways to reach it:

```bash
# Option A — /etc/hosts entry (cleanest, lets you use a real-looking name)
echo "$(minikube ip) shop.local" | sudo tee -a /etc/hosts
open "http://shop.local"

# Option B — nip.io (no sudo, no edits, just works)
open "http://$(minikube ip).nip.io"
```

You should land on the React SPA at `/`, with the GraphQL endpoint at
`/graphql` proxied to api-gateway.

## Building local images instead of pulling from Docker Hub

The default flow pulls the same images CD pushes (`docker.io/amir2575/shop-*`)
at the tag baked into [`infra/k8s/kustomization.yaml`](../../k8s/kustomization.yaml#L33-L48).
**That tag is bumped by the CI `update-manifests` job — so if you have local
commits on top of `main` that haven't been built by CI yet, the manifests will
still reference an older image.** This is the single most common reason a
service's new behaviour "doesn't show up" in the cluster even though pods are
`Running` (see [Troubleshooting](#troubleshooting), row 5).

For tight inner-loop iteration on your laptop, build into Minikube's docker
daemon and use a fresh tag:

```bash
# Make `docker` in this shell point at Minikube's daemon. Per-shell only;
# opening a new terminal resets it.
eval "$(minikube docker-env)"

# Build whichever services you've changed (all 5 if you're not sure).
for s in api-gateway web user-svc shop-svc order-svc; do
  docker build -t docker.io/amir2575/shop-${s}:dev -f apps/${s}/Dockerfile .
done

# Point the running deployments at the local :dev tag, and forbid registry
# pulls so kubelet has no way to "fix" itself by pulling the older image.
for s in api-gateway web user-svc shop-svc order-svc; do
  kubectl -n shop set image deploy/${s} ${s}=docker.io/amir2575/shop-${s}:dev
  kubectl -n shop patch deploy/${s} --type=json \
    -p='[{"op":"replace","path":"/spec/template/spec/containers/0/imagePullPolicy","value":"Never"}]'
done

# Wait for the new pods.
for s in api-gateway web user-svc shop-svc order-svc; do
  kubectl -n shop rollout status deploy/${s} --timeout=180s
done
```

To go back to registry-pulled images (e.g. after CI has built your latest
commit and bumped the kustomize tag), `git pull` and re-apply:

```bash
git pull
kubectl apply -k infra/local/minikube-overlay/
kubectl -n shop rollout restart deploy
```

## Verifying the Aiven Kafka path end-to-end

Once `pods` are `Running`, the same Kafka transport you tested locally with
`pnpm dev` is now active in the cluster:

```bash
# Producer side
kubectl -n shop logs deploy/shop-svc | grep -i kafka
# → Kafka producer connected

# Consumer side
kubectl -n shop logs deploy/order-svc | grep -i kafka
# → Kafka listener subscribed to checkout-events as group order-svc
```

Then trigger a checkout via the SPA. Watch `order-svc` for:

```
[OrderService] Order <id> created for correlation <uuid>
```

That's the round-trip: SPA → ingress-nginx → api-gateway (GraphQL) →
shop-svc (publishes to Aiven Kafka) → Aiven cluster → order-svc consumer
→ Postgres write.

## Tear down

```bash
# Just remove the workload, keep the cluster
kubectl delete -k infra/local/minikube-overlay/
kubectl delete secret shop-app-secrets -n shop --ignore-not-found

# Or nuke the entire cluster and reclaim the disk
minikube delete
```

## Troubleshooting

| # | Symptom | Likely cause / fix |
| --- | --- | --- |
| 1 | `❗ You cannot change the memory size for an existing minikube cluster` | Sizing flags are only honoured at cluster *creation*. Run `minikube delete && minikube start --memory=6g --cpus=4 --driver=docker` to recreate at the new size. |
| 2 | `pods Pending` with `Insufficient memory` | Cluster is too small — recreate with more memory (see row above). |
| 3 | `ImagePullBackOff` on every pod | You ran with `--driver=docker` but never enabled the ingress addon. Run `minikube addons enable ingress` then `kubectl rollout restart`. |
| 4 | `ImagePullBackOff` only on locally-built images | You forgot `eval $(minikube docker-env)` before `docker build`. Re-build inside the right docker daemon. |
| 5 | **All pods `Running` but the SPA's checkout response shows `Channel: http` instead of `kafka`** | The image tag in `infra/k8s/kustomization.yaml` predates the Kafka feature commit on your local branch — the running binary literally doesn't have the producer code, so it silently falls through to HTTP and logs nothing about Kafka. Verify with `git log --oneline | head` vs the `newTag:` in [`infra/k8s/kustomization.yaml`](../../k8s/kustomization.yaml). Fix by [building locally](#building-local-images-instead-of-pulling-from-docker-hub) or waiting for CI to publish a fresh tag. |
| 6 | A value in `.env` (typically a connection string with `&`, `;`, `?`) gets silently truncated when read by *any* shell-based tool — `set -a && source .env`, `docker compose`, an old `seed-secrets.sh`, etc. The Node-based `seed-secrets.mjs` here handles unquoted values correctly, but other tools won't. | Wrap the value in double quotes: `MONGO_URI="mongodb+srv://...&w=majority&appName=Main"`. Same rule for `DATABASE_URL` and any other URL with query params — bash treats `&` as "run in background" otherwise. |
| 7 | Pod `CreateContainerConfigError` with `secret "shop-app-secrets" not found` | You ran `kubectl apply -k` before `seed-secrets.mjs`. Run `seed-secrets.mjs`, then `kubectl -n shop rollout restart deploy` to recreate the pods against the new Secret. |
| 8 | `404` from `http://shop.local/` | `minikube ip` doesn't match `/etc/hosts`. Re-run `minikube ip` and update the hosts entry. |
| 9 | `Kafka producer connect failed: ECONNREFUSED` in shop-svc | Aiven service is auto-suspended (free tier sleeps after 24h idle). Power it back on in the Aiven console. |
| 10 | `This server does not host this topic-partition` | Topic `checkout-events` doesn't exist on Aiven. Run `node scripts/ensure-kafka-topic.mjs` from the repo root. |
| 11 | Pods can't reach Aiven (`ETIMEDOUT` to `*.aivencloud.com:27782`) | You started Minikube with `--cni=calico` and the NetworkPolicy isn't allowing port 27782. The overlay already adds that port; if you've further customised the policy, double-check the `shop-svc` and `order-svc` `egress:` blocks. |
