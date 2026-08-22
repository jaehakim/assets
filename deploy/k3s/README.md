# AssetFlow k3s production deployment

## Architecture

- One k3s server node with the bundled Traefik and ServiceLB disabled, because the host Nginx Proxy Manager owns ports 80/443.
- Two frontend Pods and two backend Pods. Both Deployments use `maxUnavailable: 0`, readiness probes, pre-stop delay and a PodDisruptionBudget.
- Nginx Proxy Manager forwards `assets.2734.store` to the k3s frontend NodePort `172.17.0.1:30080`.
- PostgreSQL runs as a single StatefulSet with a `local-path` PVC. Agent release binaries use a separate PVC shared by the two backend Pods on this single node.
- GitHub Actions builds immutable `sha-*` images in GHCR and a self-hosted production runner performs the rolling deployment.

> Two application replicas prevent interruption during application deployment or a single Pod failure. A one-node cluster cannot remain available if the node itself fails. Node-level high availability requires at least three server nodes and replicated storage or an external PostgreSQL service.

## Required GitHub secrets

- `ASSETFLOW_DB_PASSWORD`
- `AGENT_REGISTRATION_TOKEN`
- `AGENT_UPDATE_TOKEN`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

The workflow uses its short-lived `GITHUB_TOKEN` for GHCR pulls and creates or updates Kubernetes Secrets without writing secret values to the repository. The production runner requires the labels `self-hosted`, `linux`, and `assetflow-production`.

## Initial installation

Follow the official k3s installation method and disable components that conflict with the existing reverse proxy:

```bash
curl -sfL https://get.k3s.io | \
  INSTALL_K3S_EXEC='server --disable traefik --disable servicelb --write-kubeconfig-mode 644' sh -
kubectl apply -k deploy/k3s
```

Do not apply `secret.example.yaml`; it documents the required keys only. Create the `assetflow-secrets` and `ghcr-pull` Secrets before the first workload deployment.

## Deployment verification

```bash
kubectl -n assetflow rollout status deployment/backend --timeout=5m
kubectl -n assetflow rollout status deployment/frontend --timeout=5m
kubectl -n assetflow get deployment,pod,pdb,pvc
curl -fsS https://assets.2734.store/api/v1/health
```

Rollback uses the previous ReplicaSet and does not require stopping the service:

```bash
kubectl -n assetflow rollout undo deployment/backend
kubectl -n assetflow rollout undo deployment/frontend
```
