# 배포 가이드

## 로컬 서버

1. 저장소 루트에서 `.env.example`을 `.env`로 복사합니다.
2. `POSTGRES_PASSWORD`, `AGENT_REGISTRATION_TOKEN`, `AGENT_UPDATE_TOKEN`, `ADMIN_PASSWORD`를 각각 긴 무작위 값으로 변경합니다.
3. `docker-compose up -d --build`를 실행합니다.
4. `curl http://127.0.0.1:18080/api/v1/health`가 `{"status":"ok"}`를 반환하는지 확인합니다.

## Nginx Proxy Manager

- Domain: `assets.2734.store`
- Scheme: `http`
- Forward Hostname: 호스트 Docker 게이트웨이 또는 `frontend`
- Forward Port: `18080`(호스트 경유) 또는 `80`(공유 Docker network 사용 시)
- Websockets Support: On
- SSL: Let's Encrypt, Force SSL, HTTP/2

현재 Compose 네트워크는 `assetflow`입니다. NPM을 이 네트워크에 추가하면 Forward Hostname을 `frontend`, Port를 `80`으로 지정할 수 있습니다.

```bash
docker network connect assetflow npm
```

## 운영 전 점검

- `.env`를 Git에 커밋하지 않았는지 확인
- 기본 토큰 `change-me`가 남아 있지 않은지 확인
- `SESSION_COOKIE_SECURE=true` 및 HTTPS 강제 적용
- PostgreSQL 백업 및 복구 주기 설정
- Agent 설치 파일 코드 서명
