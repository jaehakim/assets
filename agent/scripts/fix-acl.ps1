#Requires -RunAsAdministrator
# CR-S01 ④: 기존 설치 PC의 %ProgramData%\AssetFlow 권한 교정 (0.2.12 이전 설치분, 또는 기동 거부 로그가 남은 PC)
$ErrorActionPreference = 'Stop'
$data = Join-Path $env:ProgramData 'AssetFlow'
if (-not (Test-Path $data)) { throw "$data 폴더가 없습니다." }
& icacls $data /setowner '*S-1-5-18' | Out-Null
& icacls $data /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(CI)RX' | Out-Null
$token = Join-Path $data 'agent.json'
if (Test-Path $token) { & icacls $token /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null }
$tray = Join-Path $data 'tray.json'
if (Test-Path $tray) { & icacls $tray /grant:r '*S-1-5-32-545:R' | Out-Null }
$logs = Join-Path $data 'logs'
if (Test-Path $logs) { & icacls $logs /grant:r '*S-1-5-32-545:(OI)(CI)RX' | Out-Null }
Write-Host "ACL corrected: owner SYSTEM, SYSTEM/Administrators full control, Users read-only (agent.json: no user access)."
& icacls $data
