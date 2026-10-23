# Agent 0.2.10 트레이 변경 및 Windows 검증

## 변경

- 비동기 최상위 진입점 대신 `[STAThread]` 동기 진입점에서 WinForms 메시지 루프 실행.
- 정보 수집 Worker보다 세션 감시 서비스를 먼저 시작.
- 설치 직후 관리자 프로세스로 트레이를 직접 띄우지 않고 LocalSystem 서비스가 활성 사용자 토큰으로 실행.
- 투명 배경의 단순한 모니터 아이콘으로 변경. ICO에 16/20/24/32/40/48/64/256 크기를 포함하고 EXE에도 적용.
- 아이콘 로딩 실패 시 기본 아이콘으로 대체하고 사용자별 진단 로그 기록.
- 서비스가 재실행하는 기존 '트레이 종료' 메뉴를 로그 열기와 서비스 동작 설명으로 교체.
- PowerShell 재설치 시 서비스·해당 경로 트레이를 멈춘 후 복사하고 동일 서버의 장치 ID를 보존.

## 대상과 제한

현재 배포물은 .NET 8 self-contained `win-x64`이다. Windows 10(1607 이상 런타임 기본 요구조건)·11 x64를 대상으로 하며, 모든 과거 Windows 10 빌드나 x86/ARM64 전용 지원을 의미하지 않는다. 실제 OS 지원 상태는 [Microsoft 문서](https://learn.microsoft.com/en-us/dotnet/core/install/windows)를 따른다.
Windows가 아이콘을 숨김 영역에 배치할 수 있다. 항상 보이게 하려면 사용자가 숨김 영역에서 작업 표시줄로 이동한다. [Microsoft 안내](https://support.microsoft.com/en-us/windows/experience/personalization/customize-the-taskbar-in-windows)

## Windows 시험 절차

1. Windows 10·11 x64의 표준 사용자로 로그인한 상태에서 IT 관리자 자격증명으로 설치한다.
2. 30초 내 해당 사용자 세션에 `AssetFlow.Agent.exe --tray`가 하나 생성되는지 확인한다. 숨김 아이콘 영역도 확인한다.
3. 아이콘 더블클릭 PC 정보, 우클릭 관리 페이지와 로그 열기를 시험한다.
4. 로그오프/로그인, 빠른 사용자 전환, RDP 연결/재연결마다 활성 세션의 아이콘 중복·누락을 확인한다.
5. 작업 관리자에서 Explorer를 재시작한 뒤 아이콘 복구를 확인한다.
6. 트레이 프로세스만 종료한 뒤 30초 내 복구, 서비스 heartbeat 지속을 확인한다.
7. 100/150/200% DPI, 밝은/어두운 작업 표시줄에서 16~32px 식별성을 확인한다.
8. 0.2.9에서 자동 업데이트 후 0.2.10 표시와 장치 ID 유지 여부를 확인한다.
9. 아이콘 미표시 시 `%LOCALAPPDATA%\AssetFlow\logs\tray-YYYYMMDD.log` 및 `%ProgramFiles%\AssetFlow\Agent\logs`의 세션 시작 오류를 확인한다.

Linux에서의 교차 빌드와 리소스 검증은 위 Windows 실기 시험을 대체하지 않는다.

## 아이콘 제작 기록

도구: built-in image_gen. 생성 PNG를 프로젝트에 복사하고 ImageMagick으로 Windows ICO 크기별 리소스를 패키징했다.

프롬프트:
> Use case: logo-brand. Create a replacement production Windows notification-area icon for AssetFlow IT asset management agent. Single square icon, transparent background, centered mark filling 90% of canvas. Flat clean geometric design optimized for legibility at 16 and 32 pixels. A bold indigo rounded square with a very simple white desktop monitor outline and one solid small turquoise status dot at bottom right. Use thick strokes and generous negative space. No lettering, no heartbeat line, no reflections, no gradients, no shadows, no 3D, no decorative details, no mockup, no multiple variants. Sharp silhouette legible on both dark and light Windows taskbars. Output transparent PNG.

파일: `agent/assets/assetflow-agent-icon.png`, `agent/assets/assetflow-agent-icon.ico`.
청록색 점은 브랜드 디자인이며 실시간 서버 연결 상태 표시가 아니다.

## 빌드·배포 확인 결과 (2026-09-11)

- .NET SDK 8.0.424 Linux ARM64 컨테이너에서 Windows x64 self-contained publish 성공.
- 컴파일된 DLL 메타데이터에서 `Main`의 STAThread, 어셈블리 0.2.10, ICO 내장 확인.
- EXE의 x64 GUI 헤더, 아이콘/아이콘 그룹/버전 리소스, 0.2.10.0 버전 문자열 확인.
- ICO 8개 해상도 디렉터리와 데이터 범위, PowerShell 설치 스크립트 구문 검증 통과.
- 운영 업데이트 API 업로드 성공. DB의 최신 버전 0.2.10 및 두 backend Pod에서 저장 파일 SHA-256 일치 확인.
- `https://assets.2734.store` 관리자 인증 후 릴리스 목록에서 0.2.10이 최신인지 확인하고 검증 세션 로그아웃 완료.
- 파일 크기: 72,598,245 bytes.
- SHA-256: `d53b42421cec5bddee196f9e6bec27d31310e90aea294a9fc24bc2e7f0d4beb4`.
- 서버 배포 직후 등록 장비 보고 버전은 0.2.7(1대), 0.2.9(3대)였다. 단말 전체 업데이트 완료 또는 실제 트레이 표시 성공을 의미하지 않는다.
- Windows 실기 시험: 미실행. 위 시험 절차로 별도 확인 필요.
