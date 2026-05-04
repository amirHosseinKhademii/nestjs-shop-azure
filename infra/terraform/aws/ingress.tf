# ─────────────────────────────────────────────────────────────────────────────
# ingress.tf
#
# Installs ingress-nginx via Helm. Without this, `kubectl apply -k
# infra/aws/eks-overlay/` would create the Pods + Services but the
# `Ingress` object would have no controller to translate it into an
# actual Load Balancer — your apps would have no public address.
#
# Why ingress-nginx (not the AWS Load Balancer Controller + ALB)?
#   • Identical config across Minikube / EKS / AKS / vanilla Kubernetes,
#     so the same `Ingress` manifest works everywhere.
#   • Simpler RBAC story — the chart sets up its own ServiceAccount and
#     doesn't need extra IAM (whereas the AWS LB Controller does, via
#     IRSA).
#   • One charge for the NLB, no per-rule cost like ALB.
#
# Service annotations below tell EKS to provision a *Network* Load
# Balancer (Layer 4, faster, supports TCP / UDP). To use an ALB instead,
# remove the `nlb` annotation and add the AWS LB Controller chart.
#
# The `depends_on = [module.eks]` is critical: Helm needs the cluster
# alive AND its node group ready (otherwise the controller pods stay
# Pending forever waiting for nodes). The eks_managed_node_groups output
# becomes available only after the nodes have joined.
# ─────────────────────────────────────────────────────────────────────────────

resource "kubernetes_namespace" "ingress_nginx" {
  count = var.install_ingress_nginx ? 1 : 0

  metadata {
    name = "ingress-nginx"
  }

  depends_on = [module.eks]
}

resource "helm_release" "ingress_nginx" {
  count = var.install_ingress_nginx ? 1 : 0

  name       = "ingress-nginx"
  namespace  = kubernetes_namespace.ingress_nginx[0].metadata[0].name
  repository = "https://kubernetes.github.io/ingress-nginx"
  chart      = "ingress-nginx"
  version    = var.ingress_nginx_chart_version

  # Wait for the LoadBalancer Service to actually get an external hostname
  # before considering the Helm release complete. Without this, the
  # `outputs.tf` would print `<pending>` and CI's first deploy would race.
  wait          = true
  wait_for_jobs = true
  timeout       = 600

  values = [yamlencode({
    controller = {
      service = {
        type = "LoadBalancer"
        annotations = {
          # Use a Network Load Balancer (NLB) instead of the legacy
          # Classic ELB. NLBs are faster, cheaper per-LCU, and the
          # only forward-looking choice in 2025+.
          "service.beta.kubernetes.io/aws-load-balancer-type"   = "nlb"
          "service.beta.kubernetes.io/aws-load-balancer-scheme" = "internet-facing"
        }
        # Real client IP into the X-Forwarded-For header. Without this
        # all your access logs will show the LB's private IP.
        externalTrafficPolicy = "Local"
      }

      # Two replicas across the two AZs. With 1 replica a node restart
      # would briefly drop traffic; with 2 the NLB has a healthy target
      # at all times.
      replicaCount = 2

      # Modest pod resource requests so the controller schedules onto
      # t3.medium nodes alongside the application pods.
      resources = {
        requests = {
          cpu    = "100m"
          memory = "128Mi"
        }
      }
    }
  })]

  depends_on = [module.eks]
}
