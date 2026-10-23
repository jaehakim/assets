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
  INSTALL_K3S_EXEC='server --disable traefik --disable servicelb --write-kubeconfig-mode 600' sh -
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

## 2026-10-23 변경 (수정요청 반영)

- **CI 가드 (CR-S11)**: `docs/**`·`*.md`만 바뀐 푸시는 배포하지 않는다. `deploy` 잡은 GitHub `production` 환경을 사용하므로 저장소 *Settings → Environments → production*에서 **필수 승인자**를 지정해야 보호가 실제로 동작한다. 러너 계정의 sudoers는 `k3s ctr images pull`로 제한한다.
- **단일 롤아웃 (CR-029)**: 매니페스트에 `:latest`가 없고 `kustomization.yaml`의 `images.newTag`를 CI가 `sha-<7자>`로 치환해 `kubectl apply -k` 한 번으로 배포한다. 수동 배포 시 `newTag`와 `DEPLOY_GIT_SHA`(`set-by-ci`)를 직접 바꾼다.
- **풀 시크릿 (CR-S12)**: `GHCR_PULL_TOKEN` GitHub Secret(`read:packages` 전용 기계 계정 PAT, 만료 1년)을 등록하면 `ghcr-pull`이 그 토큰으로 생성된다. 없으면 `GITHUB_TOKEN`으로 생성되어 잡 종료 후 만료되며 워크플로가 경고를 남긴다.
- **헬스체크 (CR-026)**: readiness `/actuator/health/readiness`(DB 포함), liveness `/actuator/health/liveness`.
- **백업 (CR-025)**: `backup.yaml` CronJob이 매일 03:00 KST에 PVC `postgres-backups`로 덤프한다. 복구·리허설 절차는 [RESTORE.md](RESTORE.md). 오프노드 복제는 `OFFSITE_REMOTE`·`postgres-backup-offsite` Secret 설정 후 동작한다.
- **기동 조건 (CR-007)**: 등록·업데이트 토큰, 관리자·DB 비밀번호가 32자 미만이거나 기본값이면 backend가 기동하지 않는다. 로컬 개발에서만 `REQUIRE_STRONG_SECRETS=false`를 쓴다.
