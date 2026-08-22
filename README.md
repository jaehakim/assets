# AssetFlow

Windows PC의 하드웨어·OS·네트워크·소프트웨어·보안 상태를 수집하고 중앙에서 관리하는 IT 자산관리 시스템입니다. 에이전트는 자산관리 목적의 정보만 수집하며 원격 명령, 파일 전송, 화면 캡처 기능을 제공하지 않습니다.

## 아키텍처

```text
Windows PC                    Docker Server
┌──────────────────┐  HTTPS  ┌─────────────────────────────┐
│ .NET 8 Service   ├────────►│ Nginx → Spring Boot API     │
│ WMI / Registry   │  JSON   │          ↓                  │
│ Windows API      │         │       PostgreSQL            │
└──────────────────┘         │          ↓                  │
                             │     React Admin UI          │
                             └─────────────────────────────┘
```

| 영역 | 기술 | 구현 내용 |
|---|---|---|
| Windows Agent | C# / .NET 8 Worker Service | 장치 등록, WMI·Registry 수집, 인벤토리·하트비트 전송 |
| Backend | Java 21 / Spring Boot 3 | 등록 인증, 장치 토큰 인증, 자산 저장·조회·집계 API |
| Database | PostgreSQL 16 | Agent와 Asset 분리, 디스크·소프트웨어 관계 저장 |
| Frontend | React 19 / Vite | 현황 카드, 보안 알림, 자산 검색 및 상태 목록 |
| Proxy | Nginx | SPA 제공 및 `/api` 리버스 프록시 |

### React 적용 분석

초기 기획의 Vue 3 대신 React를 적용했습니다. 현재 화면은 서버 상태 조회와 검색 중심이라 React hooks만으로 상태를 관리하며, 불필요한 전역 상태 라이브러리를 도입하지 않았습니다. API 계약은 프런트엔드 프레임워크와 독립적이므로 Agent와 Backend에는 변경이 없습니다. 규모가 커지면 React Router와 TanStack Query를 추가하는 것을 권장합니다.

## 구현된 기능

- 회사 등록 토큰을 이용한 최초 Agent 등록
- 256-bit 장치 토큰 발급 및 SHA-256 해시 저장
- 호스트명, 제조사, 모델, 시리얼, BIOS, CPU, RAM, OS 수집
- IP, MAC, 고정 디스크 및 설치 프로그램 수집
- BitLocker, Firewall, Defender 상태 수집
- 15분 기준 온라인/오프라인, 7일 기준 장기 미접속 집계
- 자산 검색, 최근 접속 장비 및 보안 경고 대시보드
- PostgreSQL 영속 볼륨 및 Docker health check
- Windows Service 설치·제거 PowerShell 스크립트
- 설치 폴더 `logs`의 날짜별 Agent 실행 로그
- Windows 시스템 트레이에서 Agent 버전과 PC 요약 정보 확인 및 관리 페이지 열기
- 5분 주기 신규 버전 확인, SHA-256 검증 및 서비스 자동 교체
- 관리자 로그인 세션과 Agent 운영 Mermaid 다이어그램

## 실행

```bash
cp .env.example .env
# .env의 비밀번호와 토큰을 변경
docker-compose up -d --build
```

- Web: `http://localhost:18080`
- API 상태: `http://localhost:18080/api/v1/health`
- 권장 운영 도메인: `assets.2734.store`

## Windows Agent 설치

Windows 관리자 PowerShell에서 .NET 8 SDK로 빌드합니다.

```powershell
cd agent
dotnet publish -c Release -r win-x64 --self-contained true -o publish
.\scripts\install-service.ps1 `
  -ApiUrl "https://assets.2734.store" `
  -RegistrationToken "서버의-AGENT_REGISTRATION_TOKEN"
```

장치 설정과 발급 토큰은 `%ProgramData%\AssetFlow\agent.json`에 저장됩니다. 서비스 제거는 `scripts\uninstall-service.ps1`을 사용합니다.
실행 로그는 `%ProgramFiles%\AssetFlow\Agent\logs\agent-YYYYMMDD.log`에 저장됩니다. `CollectionMinutes`의 기본값은 60분, `UpdateCheckMinutes`의 기본값은 5분이며 최소 실행 주기는 각각 5분입니다.

빌드된 단일 실행 파일은 `agent/release/AssetFlow.Agent.exe`에 포함됩니다. 배포 전 `agent/release/SHA256SUMS.txt`로 무결성을 확인하십시오.

## API

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| POST | `/api/v1/agents/register` | `X-Registration-Token` | Agent 최초 등록 및 장치 토큰 발급 |
| POST | `/api/v1/agents/inventory` | `Bearer DEVICE_TOKEN` | 전체 인벤토리 갱신 |
| POST | `/api/v1/agents/heartbeat` | `Bearer DEVICE_TOKEN` | Agent 상태 보고 |
| GET | `/api/v1/dashboard` | 관리자 세션 | 현황 집계 |
| GET | `/api/v1/assets` | 관리자 세션 | 자산 검색·목록 |
| GET | `/api/v1/assets/{id}` | 관리자 세션 | 디스크·SW 포함 상세 |
| POST | `/api/v1/auth/login` | 계정 | 관리자 로그인 |
| POST | `/api/v1/admin/agent-releases` | X-Update-Token | 신규 Agent EXE 등록 |
| GET | `/api/v1/agents/updates/latest` | 장치 Bearer | 최신 Agent 버전 조회 |
| GET | `/api/v1/admin/agent-update-history` | 관리자 세션 | 장비별 Agent 버전 변경 이력 조회 |

## 개발 계획

| 단계 | 상태 | 내용 |
|---|---|---|
| 1. MVP 기반 | 완료 | 모노레포, DB, API, React 대시보드, Agent 수집기 |
| 2. 운영 인증 | 예정 | 관리자 OIDC/세션, RBAC, 감사 로그, API rate limit |
| 3. 신뢰성 | 예정 | Agent 로컬 SQLite queue, 재전송·backoff, 변경 이력 |
| 4. 관리 기능 | 예정 | 부서·사용자·자산번호, 상세 화면, SW/보안 통계 |
| 5. 배포 자동화 | 예정 | MSI, 코드 서명, 서명된 자동 업데이트, CI/CD |
| 6. 대량 배포 | 예정 | AD GPO, Intune/SCCM 배포 가이드와 정책 템플릿 |

## 보안 원칙

- 브라우저 기록·비밀번호, 문서/메일 내용, 키 입력, 화면, 개인 파일 목록은 수집하지 않습니다.
- 서버에서 임의 CMD/PowerShell/EXE를 실행하는 RMM 기능은 범위에서 제외합니다.
- 운영 전 관리자 인증, TLS, 비밀값 교체, Agent 실행 파일 코드 서명을 완료해야 합니다.
- Agent ID만으로 인증하지 않고 등록 토큰과 장치별 Bearer 토큰을 분리합니다.

## 변경 이력

### 2026-08-22 — 0.2.7

- 도메인/워크그룹, 장치 UUID, OS 빌드·아키텍처·설치일·최근 부팅 정보 수집
- CPU 코어, 논리 프로세서, TPM·Secure Boot 및 소프트웨어 설치일 수집
- 관리자 상세 화면의 시스템·보안 정보 확장
- GHCR 이미지와 k3s 2 Replica RollingUpdate 기반 무중단 배포 구성
- 운영형 Admin UI 패턴을 적용한 로그인·대시보드 개편

### 2026-08-22 — 0.2.6

- Agent 등록 및 하트비트에서 버전 변경을 감지해 업데이트 이력으로 저장
- Agent 운영 화면에 장비명, 이전/현재 버전, 변경 시각 표시
- 사용자 로그인 시 시스템 트레이 아이콘 실행, Agent 버전·PC 정보·관리 페이지 메뉴 제공
- Agent 운영 Mermaid에 서비스, 트레이, 자동 업데이트, 이력 저장 흐름 반영

### 2026-08-22 — 0.2.2

- 등록 토큰 앞뒤 공백 정규화 및 기본 토큰 설치 차단
- 저장된 설정보다 `ASSETFLOW_API_URL`, `ASSETFLOW_REGISTRATION_TOKEN` 환경변수를 우선 적용
- HTTP 401 등록 실패 시 설정 파일 위치와 복구 방법을 로그에 명시

### 2026-08-22 — 0.1.0

- 초기 모노레포와 Docker Compose 구축
- Vue 3 계획을 검토해 React 19 + Vite로 변경
- Spring Boot 수집/조회 API 및 PostgreSQL 스키마 추가
- .NET 8 Windows Service Agent와 설치 스크립트 추가
- Nginx 기반 단일 진입점과 반응형 관리자 대시보드 추가

운영 및 Nginx Proxy Manager 연결 방법은 [배포 문서](deploy/README.md)를 참고하십시오.
k3s·GHCR 기반 무중단 운영 구성은 [k3s 배포 문서](deploy/k3s/README.md)를 참고하십시오.
