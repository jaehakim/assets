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
# 0.3.1 pre-install security checks: run before the existing Agent is stopped or replaced; any FAIL leaves it untouched.
# The checks travel in install-pending.json and the new Agent reports them with its post-install checks.
$checks = New-Object System.Collections.ArrayList
function Add-Check($n, $ok, $d, [switch]$Warn) { [void]$checks.Add([ordered]@{ name = $n; status = $(if ($ok) { 'PASS' } elseif ($Warn) { 'WARN' } else { 'FAIL' }); detail = [string]$d }) }
Add-Check 'ADMIN' $true 'elevated installer'
Add-Check 'OS' $true ('Windows build ' + [Environment]::OSVersion.Version.Build)
$stream = [IO.File]::OpenRead($source); $m0 = $stream.ReadByte(); $m1 = $stream.ReadByte(); $stream.Close()
Add-Check 'PE' ($m0 -eq 77 -and $m1 -eq 90) 'Windows PE'
$newVersion = [version](Get-Item $source).VersionInfo.FileVersion
$toVersion = '' + $newVersion.Major + '.' + $newVersion.Minor + '.' + $newVersion.Build
Add-Check 'FILE_VERSION' ($newVersion -ne $null) $toVersion
$hash = (Get-FileHash -Algorithm SHA256 $source).Hash
Add-Check 'SHA256' $true ($hash.Substring(0, 12).ToLower() + ' (local publish)')
Add-Check 'SIGNATURE' $false 'not enforced - SHA-256 integrity instead (CR-001/WP-7)' -Warn
Start-Sleep -Seconds 20
$intact = (Test-Path $source) -and ((Get-FileHash -Algorithm SHA256 $source).Hash -eq $hash)
Add-Check 'AV_PROBE' $intact $(if ($intact) { 'file intact after 20s' } else { 'file missing/changed after 20s (quarantine suspected)' })
$free = (Get-PSDrive $env:ProgramFiles.Substring(0, 1)).Free
Add-Check 'DISK' ($free -gt 3 * (Get-Item $source).Length) (('{0:N0}' -f ($free / 1MB)) + ' MB')
$fromVersion = $null
if (Test-Path $exe) { try { $v = [version](Get-Item $exe).VersionInfo.FileVersion; $fromVersion = '' + $v.Major + '.' + $v.Minor + '.' + $v.Build } catch { $fromVersion = 'unknown' } }
$kind = if ($service -and $service.Status -eq 'Stopped' -and (Test-Path $target) -and (Get-Acl $target).Owner -eq 'NT AUTHORITY\SYSTEM') { 'REPAIR' } else { 'INSTALL' }
Add-Check 'EXISTING' $true $(if ($fromVersion) { "installed $fromVersion - replaced only after these checks ($kind)" } else { 'none' })
$checks | ForEach-Object { Write-Host ('  ' + $_.status.PadRight(5) + $_.name.PadRight(13) + $_.detail) }
if (@($checks | Where-Object { $_.status -eq 'FAIL' }).Count -gt 0) { throw 'Pre-install security checks failed; the existing Agent was not changed.' }
if ($service -and $service.Status -ne 'Stopped') {
    try { Stop-Service $name -Force; $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30)) }
    catch { throw 'The installed Agent is protected against removal (0.3.0+). Remove it with administrator approval (uninstall-service.ps1 -Code/-Reason or the AssetFlow console) and run the installer again.' }
}
# Stop only this installation's interactive processes before replacing its executable.
Get-Process 'AssetFlow.Agent' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Stop-Process -Force
# 0.3.1: a protected Agent that is not running (crashed/blocked) is repaired in place: reclaim the read-only install folder.
if ($service -and (Test-Path $target) -and (Get-Acl $target).Owner -eq 'NT AUTHORITY\SYSTEM') {
    & takeown.exe /f $target /r /d y /a | Out-Null
    & icacls.exe $target /reset /t /c /q | Out-Null
}
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
[ordered]@{ kind = $kind; fromVersion = $fromVersion; toVersion = $toVersion; startedAt = (Get-Date).ToString('o'); preChecks = $checks } |
    ConvertTo-Json -Depth 4 | Set-Content (Join-Path $data 'install-pending.json') -Encoding UTF8
& icacls $data /setowner '*S-1-5-18' | Out-Null
& icacls $data /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(CI)RX' | Out-Null
& icacls $configPath /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
& icacls (Join-Path $data 'logs') /grant:r '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to apply the ProgramData ACL (CR-S01).' }
$configured = $true
if ($service) {
    & sc.exe config $name binPath= ('"'+$exe+'"') start= auto obj= LocalSystem | Out-Null
    # A protected service (0.3.0+) refuses reconfiguration; its existing configuration already points at $exe.
    if ($LASTEXITCODE -ne 0) { Write-Warning 'The existing service is protected; keeping its configuration and repairing the files only.'; $configured = $false }
} else {
    New-Service -Name $name -BinaryPathName ('"'+$exe+'"') -DisplayName 'AssetFlow IT Asset Agent' -StartupType Automatic | Out-Null
}
if ($configured) {
    & sc.exe failure $name reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to configure service recovery.' }
}
# Removal protection (0.3.1+) is applied by the Agent itself after it has reached the server (server policy).
New-ItemProperty -Path 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'AssetFlowAgentTray' -Value ('"'+$exe+'" --tray') -PropertyType String -Force | Out-Null
Start-Service $name
Write-Host 'Agent installed. The service starts the tray as each active user within 30 seconds.'
Write-Host 'agent.json is readable by SYSTEM/Administrators only; the registration token is removed after the first successful registration (CR-005).'
Write-Host 'If hidden, open the Windows notification-area overflow arrow.'
Write-Host "Service logs: $data\logs; tray logs: %LOCALAPPDATA%\AssetFlow\logs"
