# PostgreSQL 백업·복구 절차 (CR-025)

## 백업

- `backup.yaml`의 CronJob `postgres-backup`이 매일 03:00 KST에 `pg_dump -Fc`로 덤프를 만들고 `pg_restore --list`로 무결성을 확인한 뒤 PVC `postgres-backups`(`/backups`)에 30일 보관한다.
- 수동 실행: `kubectl -n assetflow create job --from=cronjob/postgres-backup manual-$(date +%s)`
- 상태 확인: `kubectl -n assetflow get jobs -l job-name --sort-by=.metadata.creationTimestamp | tail -5`
- 오프노드 복제(결정 ③): `OFFSITE_REMOTE` 환경변수와 `postgres-backup-offsite` Secret(`rclone.conf`)을 추가하면 `rclone copy`로 외부 저장소에 복제한다. 노드 디스크 장애 시 PVC 백업만으로는 복구할 수 없으므로 운영 확대 전 반드시 설정한다.

## 복구 리허설 (분기 1회)

```bash
# 1. 최신 덤프 확인
kubectl -n assetflow run bk --rm -it --image=postgres:16-alpine --restart=Never \
  --overrides='{"spec":{"volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"postgres-backups"}}],"containers":[{"name":"bk","image":"postgres:16-alpine","command":["sh","-c","ls -la /backups && sleep 1"],"volumeMounts":[{"name":"b","mountPath":"/backups"}]}]}}'

# 2. 별도 네임스페이스에 임시 PostgreSQL 기동
kubectl create ns assetflow-restore
kubectl -n assetflow-restore run pg --image=postgres:16-alpine --env=POSTGRES_PASSWORD=restore --port=5432
kubectl -n assetflow-restore wait --for=condition=ready pod/pg --timeout=120s

# 3. 덤프 복사 후 복구 (사용자 생성 포함)
kubectl -n assetflow cp <백업Pod>:/backups/assetflow-<stamp>.dump /tmp/restore.dump
kubectl -n assetflow-restore cp /tmp/restore.dump pg:/tmp/restore.dump
kubectl -n assetflow-restore exec pg -- sh -c "psql -U postgres -c \"CREATE ROLE assetflow LOGIN PASSWORD 'restore'\" && createdb -U postgres -O assetflow assetflow && pg_restore -U postgres -d assetflow --no-owner --role=assetflow /tmp/restore.dump"

# 4. 검증: 자산 수·최근 하트비트가 운영과 일치하는지 비교
kubectl -n assetflow-restore exec pg -- psql -U postgres -d assetflow -c "SELECT count(*) assets, max(last_seen_at) FROM asset"

# 5. 정리 및 RPO/RTO 기록 (09 양식에 첨부)
kubectl delete ns assetflow-restore
```

## 운영 복구 (실제 장애)

1. `kubectl -n assetflow scale deploy/backend --replicas=0`
2. StatefulSet `postgres`의 PVC가 손상된 경우 PVC 삭제 후 재생성 → 위 3단계와 같이 `pg_restore`
3. `kubectl -n assetflow scale deploy/backend --replicas=2` → `/actuator/health/readiness`가 UP인지 확인
4. 복구 시각·손실 구간(RPO)·소요(RTO)를 점검 일지에 기록
