#Requires -RunAsAdministrator
param([string]$ApiUrl='https://assets.2734.store',[Parameter(Mandatory=$true)][string]$RegistrationToken)
$ErrorActionPreference = 'Stop'
$RegistrationToken = $RegistrationToken.Trim()
if ([string]::IsNullOrWhiteSpace($RegistrationToken) -or $RegistrationToken -eq 'change-me') {
    throw 'A valid server AGENT_REGISTRATION_TOKEN is required.'
}
if (-not [Environment]::Is64BitOperatingSystem -or [Environment]::OSVersion.Version.Build -lt 14393) {
    throw 'This package requires Windows 10 version 1607 or later, x64.'
}
$name = 'AssetFlowAgent'
$target = Join-Path $env:ProgramFiles 'AssetFlow\Agent'
$exe = Join-Path $target 'AssetFlow.Agent.exe'
$data = Join-Path $env:ProgramData 'AssetFlow'
$source = Join-Path $PSScriptRoot '..\publish\AssetFlow.Agent.exe'
if (-not (Test-Path $source)) { throw 'Publish the Agent before installation.' }
$configPath = Join-Path $data 'agent.json'
if (Test-Path $configPath) {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
    if ($config.ApiUrl.TrimEnd('/') -ne $ApiUrl.Trim().TrimEnd('/')) {
        throw 'Existing device belongs to another API URL. Use an approved re-enrollment procedure.'
    }
    $config.RegistrationToken = $RegistrationToken
} else {
    $config = @{ApiUrl=$ApiUrl.Trim();RegistrationToken=$RegistrationToken;CollectionMinutes=60;UpdateCheckMinutes=5}
}
$service = Get-Service $name -ErrorAction SilentlyContinue
if ($service -and $service.Status -ne 'Stopped') {
    Stop-Service $name -Force
    $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
}
# Stop only this installation's interactive processes before replacing its executable.
Get-Process 'AssetFlow.Agent' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Stop-Process -Force
New-Item -ItemType Directory -Force $target,(Join-Path $target 'logs') | Out-Null
Copy-Item $source $exe -Force
# CR-S01 ①: 일반 사용자가 선점한 ProgramData 폴더를 신뢰하지 않는다 — 설정 파일만 보존하고 폴더를 재생성한 뒤 ACL을 명시한다.
if (Test-Path $data) {
    $owner = (Get-Acl $data).Owner
    if ($owner -notin @('NT AUTHORITY\SYSTEM','BUILTIN\Administrators')) { Write-Warning "$data owner is $owner; recreating the folder." }
    Get-ChildItem $data -Force | Where-Object { $_.Name -notin @('agent.json','logs') } | Remove-Item -Recurse -Force
}
New-Item -ItemType Directory -Force $data,(Join-Path $data 'logs') | Out-Null
$config | ConvertTo-Json | Set-Content $configPath -Encoding UTF8
& icacls $data /setowner '*S-1-5-18' | Out-Null
& icacls $data /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(CI)RX' | Out-Null
& icacls $configPath /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
& icacls (Join-Path $data 'logs') /grant:r '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to apply the ProgramData ACL (CR-S01).' }
if ($service) {
    & sc.exe config $name binPath= ('"'+$exe+'"') start= auto obj= LocalSystem | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to configure Agent service.' }
} else {
    New-Service -Name $name -BinaryPathName ('"'+$exe+'"') -DisplayName 'AssetFlow IT Asset Agent' -StartupType Automatic | Out-Null
}
& sc.exe failure $name reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to configure service recovery.' }
New-ItemProperty -Path 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'AssetFlowAgentTray' -Value ('"'+$exe+'" --tray') -PropertyType String -Force | Out-Null
Start-Service $name
Write-Host 'Agent installed. The service starts the tray as each active user within 30 seconds.'
Write-Host 'agent.json is readable by SYSTEM/Administrators only; the registration token is removed after the first successful registration (CR-005).'
Write-Host 'If hidden, open the Windows notification-area overflow arrow.'
Write-Host "Service logs: $data\logs; tray logs: %LOCALAPPDATA%\AssetFlow\logs"
