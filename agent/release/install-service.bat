@echo off
setlocal DisableDelayedExpansion
set "SERVICE_NAME=AssetFlowAgent"
set "DISPLAY_NAME=AssetFlow IT Asset Agent"
set "INSTALL_DIR=%ProgramFiles%\AssetFlow\Agent"
set "CONFIG_DIR=%ProgramData%\AssetFlow"
set "API_URL=https://assets.2734.store"
set "DOWNLOAD_FILE=%TEMP%\AssetFlow.Agent.install.%RANDOM%.exe"
set "DOWNLOAD_CONFIG=%TEMP%\AssetFlow.Agent.install.%RANDOM%.json"
set "DOWNLOAD_RELEASE=%TEMP%\AssetFlow.Agent.release.%RANDOM%.json"
set "DOWNLOAD_PENDING=%TEMP%\AssetFlow.Agent.pending.%RANDOM%.json"
set "KIND=INSTALL"

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting administrator privileges...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
echo.
echo The latest AssetFlow Agent will be downloaded and installed as a new device.
echo API URL: %API_URL%
set /p "REGISTRATION_TOKEN=Enter the agent registration token: "
if not defined REGISTRATION_TOKEN (
  echo [ERROR] A registration token is required.
  pause
  exit /b 1
)

echo [0/7] Checking the existing Agent before anything is changed...
rem 0.3.1: a running protected Agent is never replaced (and the device is not re-registered, which would revoke its token).
rem A protected Agent that is not running is repaired in place (KIND=REPAIR).
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$s=Get-Service -Name '%SERVICE_NAME%' -ErrorAction SilentlyContinue;if(-not $s){exit 0};$sd=(& sc.exe sdshow '%SERVICE_NAME%') -join '';$protected=($sd -match '\(A;;[A-Z]*;;;BA\)') -and -not ($sd -match '\(A;;[A-Z]*WP[A-Z]*;;;BA\)');if(-not $protected){exit 0};if($s.Status -ne 'Stopped'){exit 5};exit 6"
if errorlevel 6 (
  set "KIND=REPAIR"
  echo     The installed Agent is protected but not running - it will be repaired.
) else if errorlevel 5 (
  goto :protected
)

echo [1/7] Registering this device and downloading the latest Agent...
set "ASSETFLOW_SETUP_API_URL=%API_URL%"
set "ASSETFLOW_SETUP_TOKEN=%REGISTRATION_TOKEN%"
set "ASSETFLOW_DOWNLOAD_FILE=%DOWNLOAD_FILE%"
set "ASSETFLOW_DOWNLOAD_CONFIG=%DOWNLOAD_CONFIG%"
set "ASSETFLOW_DOWNLOAD_RELEASE=%DOWNLOAD_RELEASE%"
set "ASSETFLOW_DOWNLOAD_PENDING=%DOWNLOAD_PENDING%"
set "ASSETFLOW_KIND=%KIND%"
del /f /q "%DOWNLOAD_FILE%" "%DOWNLOAD_CONFIG%" "%DOWNLOAD_RELEASE%" "%DOWNLOAD_PENDING%" >nul 2>&1
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;$base=$env:ASSETFLOW_SETUP_API_URL.Trim().TrimEnd('/');$registration=$env:ASSETFLOW_SETUP_TOKEN.Trim();$machineGuid=(Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid -ErrorAction SilentlyContinue).MachineGuid;if([string]::IsNullOrWhiteSpace($machineGuid)){$machineGuid=$env:COMPUTERNAME};$sha=[Security.Cryptography.SHA256]::Create();try{$key=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($env:COMPUTERNAME+'|'+$machineGuid)))).Replace('-','')}finally{$sha.Dispose()};$body=@{agentKey=$key;hostname=$env:COMPUTERNAME;version='0.0.0'}|ConvertTo-Json;$registered=Invoke-RestMethod -Method Post -Uri ($base+'/api/v1/agents/register') -Headers @{'X-Registration-Token'=$registration} -ContentType 'application/json' -Body $body;$headers=@{Authorization='Bearer '+$registered.deviceToken};$release=Invoke-RestMethod -Method Get -Uri ($base+'/api/v1/agents/updates/latest') -Headers $headers;if(-not $release -or -not $release.version -or -not $release.sha256){throw 'The server did not return valid release metadata.'};$downloadUrl=if($release.downloadUrl -match '^https?://'){$release.downloadUrl}else{$base+'/'+$release.downloadUrl.TrimStart('/')};Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -Headers $headers -OutFile $env:ASSETFLOW_DOWNLOAD_FILE;if((Get-Item -LiteralPath $env:ASSETFLOW_DOWNLOAD_FILE).Length -ne [long]$release.size){throw 'Downloaded Agent size does not match release metadata.'};$actual=(Get-FileHash -Algorithm SHA256 -LiteralPath $env:ASSETFLOW_DOWNLOAD_FILE).Hash;if($actual -ne $release.sha256){throw 'Downloaded Agent SHA-256 does not match release metadata.'};$release|ConvertTo-Json|Set-Content -LiteralPath $env:ASSETFLOW_DOWNLOAD_RELEASE -Encoding UTF8;@{ApiUrl=$base;RegistrationToken=$registration;DeviceToken=$registered.deviceToken;AgentId=$registered.agentId;CollectionMinutes=60;UpdateCheckMinutes=5}|ConvertTo-Json|Set-Content -LiteralPath $env:ASSETFLOW_DOWNLOAD_CONFIG -Encoding UTF8;Write-Host ('Latest Agent version '+$release.version+' downloaded and verified.')"
if errorlevel 1 goto :failed
if not exist "%DOWNLOAD_FILE%" goto :failed
if not exist "%DOWNLOAD_CONFIG%" goto :failed

echo [2/7] Security pre-checks on the downloaded Agent (the existing Agent is untouched until they pass)...
rem 0.3.1: integrity, executable type/version, antivirus quarantine probe, disk space. The result is sent to the server
rem (install-report PRECHECK); the Agent sends the post-install checks after its first successful heartbeat.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';$cfg=Get-Content -LiteralPath $env:ASSETFLOW_DOWNLOAD_CONFIG -Raw|ConvertFrom-Json;$rel=Get-Content -LiteralPath $env:ASSETFLOW_DOWNLOAD_RELEASE -Raw|ConvertFrom-Json;$f=$env:ASSETFLOW_DOWNLOAD_FILE;$c=New-Object System.Collections.ArrayList;function A($n,$ok,$d,$w){[void]$c.Add([ordered]@{name=$n;status=$(if($ok){'PASS'}elseif($w){'WARN'}else{'FAIL'});detail=[string]$d})};A 'ADMIN' $true 'elevated installer';$os=[Environment]::OSVersion.Version;A 'OS' ([Environment]::Is64BitOperatingSystem -and $os.Build -ge 14393) ('Windows build '+$os.Build);A 'REGISTER' ([bool]$cfg.DeviceToken) ('agent '+$cfg.AgentId);$len=(Get-Item -LiteralPath $f).Length;A 'SIZE' ($len -eq [long]$rel.size) ([string]$len+' / '+$rel.size+' bytes');$h=(Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash;A 'SHA256' ($h -eq $rel.sha256) $h.Substring(0,12).ToLower();$fs=[IO.File]::OpenRead($f);$m0=$fs.ReadByte();$m1=$fs.ReadByte();$fs.Close();A 'PE' ($m0 -eq 77 -and $m1 -eq 90) 'Windows PE';$fv=(Get-Item -LiteralPath $f).VersionInfo.FileVersion;A 'FILE_VERSION' ($fv -eq ($rel.version+'.0') -or $fv -eq $rel.version) ([string]$fv+' (release '+$rel.version+')');A 'SIGNATURE' $false 'not enforced - SHA-256 integrity instead (CR-001/WP-7)' $true;Start-Sleep -Seconds 20;$ok=$false;$d='file missing after 20s (quarantine suspected)';try{if(Test-Path -LiteralPath $f){$ok=((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -eq $h);$d='file intact after 20s'}}catch{$d='file access blocked'};A 'AV_PROBE' $ok $d;$free=(Get-PSDrive $env:ProgramFiles.Substring(0,1)).Free;A 'DISK' ($free -gt 3*$len) (('{0:N0}' -f ($free/1MB))+' MB');$old=Join-Path $env:ProgramFiles 'AssetFlow\Agent\AssetFlow.Agent.exe';$from=$null;if(Test-Path -LiteralPath $old){try{$v=[version](Get-Item -LiteralPath $old).VersionInfo.FileVersion;$from=''+$v.Major+'.'+$v.Minor+'.'+$v.Build}catch{$from='unknown'}};A 'EXISTING' $true $(if($from){'installed '+$from+' - removed only after these checks ('+$env:ASSETFLOW_KIND+')'}else{'none'});$fail=@($c|Where-Object{$_.status -eq 'FAIL'}).Count -gt 0;$pass=@($c|Where-Object{$_.status -eq 'PASS'}).Count;$report=[ordered]@{kind=$env:ASSETFLOW_KIND;stage='PRECHECK';result=$(if($fail){'BLOCKED'}else{'PASSED'});fromVersion=$from;toVersion=$rel.version;checks=$c;summary=([string]$pass+'/'+$c.Count+' passed');checkedAt=(Get-Date).ToString('o')};try{Invoke-RestMethod -Method Post -Uri ($cfg.ApiUrl.TrimEnd('/')+'/api/v1/agents/install-report') -Headers @{Authorization='Bearer '+$cfg.DeviceToken} -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($report|ConvertTo-Json -Depth 4)))|Out-Null}catch{Write-Host ('    [WARN] pre-check report not sent: '+$_.Exception.Message)};foreach($x in $c){Write-Host ('    '+$x.status.PadRight(5)+$x.name.PadRight(13)+$x.detail)};if($fail){exit 4};[ordered]@{kind=$env:ASSETFLOW_KIND;fromVersion=$from;toVersion=$rel.version;startedAt=(Get-Date).ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath $env:ASSETFLOW_DOWNLOAD_PENDING -Encoding UTF8"
if errorlevel 4 goto :blocked
if errorlevel 1 goto :failed

echo [3/7] Stopping and deleting the existing service...
sc.exe query "%SERVICE_NAME%" >nul 2>&1
if not errorlevel 1 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';$s=Get-Service -Name '%SERVICE_NAME%' -ErrorAction SilentlyContinue;if($s -and $s.Status -ne 'Stopped'){Stop-Service -Name '%SERVICE_NAME%' -Force;$s.WaitForStatus('Stopped',[TimeSpan]::FromSeconds(30))};$s=Get-Service -Name '%SERVICE_NAME%' -ErrorAction SilentlyContinue;if($s -and $s.Status -ne 'Stopped'){exit 1}"
  if errorlevel 1 goto :protected
  sc.exe delete "%SERVICE_NAME%" >nul 2>&1
  if errorlevel 1 goto :repair
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$limit=(Get-Date).AddSeconds(30);do{$s=Get-Service -Name '%SERVICE_NAME%' -ErrorAction SilentlyContinue;if(-not $s){exit 0};Start-Sleep -Milliseconds 500}while((Get-Date) -lt $limit);exit 1"
  if errorlevel 1 goto :failed
)
goto :clean

:repair
rem 0.3.1: a protected Agent whose service is NOT running (crashed, blocked or failed to start) cannot be deleted,
rem but it can be repaired in place: reclaim the install folder, reinstall the files and start the existing service.
rem A running protected Agent still goes to :protected above (removal requires approval).
set "REPAIR=1"
echo     The existing service is protected but not running - repairing it in place.
if exist "%INSTALL_DIR%" (
  takeown.exe /f "%INSTALL_DIR%" /r /d y /a >nul 2>&1
  icacls.exe "%INSTALL_DIR%" /reset /t /c /q >nul 2>&1
)

:clean

rem Stop a manually started or orphaned Agent process that may still lock the files.
taskkill.exe /F /IM "AssetFlow.Agent.exe" >nul 2>&1

echo [4/7] Removing the old executable, logs, and device identity...
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%"
rem CR-S01 (1): never trust a pre-existing ProgramData folder (it may have been created by a standard user).
if exist "%CONFIG_DIR%" rmdir /s /q "%CONFIG_DIR%"
if exist "%INSTALL_DIR%" goto :failed
if exist "%CONFIG_DIR%" goto :failed

echo [5/7] Installing the downloaded Agent...
mkdir "%INSTALL_DIR%\logs" >nul 2>&1
mkdir "%CONFIG_DIR%\logs" >nul 2>&1
icacls "%CONFIG_DIR%" /setowner "*S-1-5-18" >nul
icacls "%CONFIG_DIR%" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-32-545:(CI)RX" >nul
if errorlevel 1 goto :failed
icacls "%CONFIG_DIR%\logs" /grant:r "*S-1-5-32-545:(OI)(CI)RX" >nul
move /y "%DOWNLOAD_FILE%" "%INSTALL_DIR%\AssetFlow.Agent.exe" >nul
if errorlevel 1 goto :failed

echo [6/7] Installing the registered device configuration and the pending install record...
move /y "%DOWNLOAD_CONFIG%" "%CONFIG_DIR%\agent.json" >nul
if errorlevel 1 goto :failed
icacls "%CONFIG_DIR%\agent.json" /inheritance:r /grant:r "*S-1-5-18:F" "*S-1-5-32-544:F" >nul
if errorlevel 1 goto :failed
rem The Agent runs the post-install checks for this record and reports them after its first successful heartbeat.
move /y "%DOWNLOAD_PENDING%" "%CONFIG_DIR%\install-pending.json" >nul
del /f /q "%DOWNLOAD_RELEASE%" >nul 2>&1
rem The service encrypts the device token (DPAPI) and removes the registration token on first start (CR-005).
set "REGISTRATION_TOKEN="
set "ASSETFLOW_SETUP_TOKEN="

echo [7/7] Creating and starting the new service and tray app...
if defined REPAIR goto :start
sc.exe create "%SERVICE_NAME%" binPath= "\"%INSTALL_DIR%\AssetFlow.Agent.exe\"" start= auto DisplayName= "%DISPLAY_NAME%" >nul
if errorlevel 1 goto :failed
sc.exe description "%SERVICE_NAME%" "Collects PC inventory and checks verified release metadata for AssetFlow." >nul
sc.exe failure "%SERVICE_NAME%" reset= 86400 actions= restart/60000/restart/60000/restart/60000 >nul
rem Removal protection (0.3.1+) is applied by the Agent itself after it has reached the server (server policy).
:start
sc.exe start "%SERVICE_NAME%" >nul
if errorlevel 1 goto :failed
reg.exe add "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /v "AssetFlowAgentTray" /t REG_SZ /d "\"%INSTALL_DIR%\AssetFlow.Agent.exe\" --tray" /f >nul
rem The service starts the tray as the logged-in user without administrator elevation.

echo.
echo [OK] A clean Agent service and system tray app were installed and started.
echo The tray appears in the signed-in user's notification area within 30 seconds.
echo Windows may place the icon under the hidden-icons arrow.
echo The device was registered with the supplied token and will connect automatically.
echo Pre-install checks were sent to the server; the Agent sends the post-install checks within a few minutes.
echo Logs: %CONFIG_DIR%\logs
pause
exit /b 0

:blocked
del /f /q "%DOWNLOAD_FILE%" "%DOWNLOAD_CONFIG%" "%DOWNLOAD_RELEASE%" "%DOWNLOAD_PENDING%" >nul 2>&1
set "REGISTRATION_TOKEN="
set "ASSETFLOW_SETUP_TOKEN="
echo.
echo [BLOCKED] The downloaded Agent failed the security pre-checks above. Nothing was removed or changed;
echo the existing Agent (if any) keeps running. The result was reported to the AssetFlow console.
pause
exit /b 4

:protected
del /f /q "%DOWNLOAD_FILE%" "%DOWNLOAD_CONFIG%" "%DOWNLOAD_RELEASE%" "%DOWNLOAD_PENDING%" >nul 2>&1
set "REGISTRATION_TOKEN="
set "ASSETFLOW_SETUP_TOKEN="
echo.
echo [PROTECTED] The installed AssetFlow Agent is protected against removal and cannot be replaced directly.
echo Remove it first with administrator approval: run uninstall-service.bat (removal code or request),
echo or approve the removal in the AssetFlow console, then run this installer again.
pause
exit /b 5

:failed
set "RESULT=%errorlevel%"
if "%RESULT%"=="0" set "RESULT=1"
del /f /q "%DOWNLOAD_FILE%" "%DOWNLOAD_CONFIG%" "%DOWNLOAD_RELEASE%" "%DOWNLOAD_PENDING%" >nul 2>&1
set "REGISTRATION_TOKEN="
set "ASSETFLOW_SETUP_TOKEN="
echo.
echo [ERROR] Clean installation failed. Error code: %RESULT%
echo Check %CONFIG_DIR%\logs and Windows Event Viewer.
pause
exit /b %RESULT%
