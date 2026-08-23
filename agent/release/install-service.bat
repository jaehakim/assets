@echo off
setlocal DisableDelayedExpansion
set "SERVICE_NAME=AssetFlowAgent"
set "DISPLAY_NAME=AssetFlow IT Asset Agent"
set "INSTALL_DIR=%ProgramFiles%\AssetFlow\Agent"
set "CONFIG_DIR=%ProgramData%\AssetFlow"
set "API_URL=https://assets.2734.store"
set "DOWNLOAD_FILE=%TEMP%\AssetFlow.Agent.install.%RANDOM%.exe"
set "DOWNLOAD_CONFIG=%TEMP%\AssetFlow.Agent.install.%RANDOM%.json"

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

echo [1/6] Registering this device and downloading the latest Agent...
set "ASSETFLOW_SETUP_API_URL=%API_URL%"
set "ASSETFLOW_SETUP_TOKEN=%REGISTRATION_TOKEN%"
set "ASSETFLOW_DOWNLOAD_FILE=%DOWNLOAD_FILE%"
set "ASSETFLOW_DOWNLOAD_CONFIG=%DOWNLOAD_CONFIG%"
del /f /q "%DOWNLOAD_FILE%" "%DOWNLOAD_CONFIG%" >nul 2>&1
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;$base=$env:ASSETFLOW_SETUP_API_URL.Trim().TrimEnd('/');$registration=$env:ASSETFLOW_SETUP_TOKEN.Trim();$machineGuid=(Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid -ErrorAction SilentlyContinue).MachineGuid;if([string]::IsNullOrWhiteSpace($machineGuid)){$machineGuid=$env:COMPUTERNAME};$sha=[Security.Cryptography.SHA256]::Create();try{$key=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($env:COMPUTERNAME+'|'+$machineGuid)))).Replace('-','')}finally{$sha.Dispose()};$body=@{agentKey=$key;hostname=$env:COMPUTERNAME;version='0.0.0'}|ConvertTo-Json;$registered=Invoke-RestMethod -Method Post -Uri ($base+'/api/v1/agents/register') -Headers @{'X-Registration-Token'=$registration} -ContentType 'application/json' -Body $body;$headers=@{Authorization='Bearer '+$registered.deviceToken};$release=Invoke-RestMethod -Method Get -Uri ($base+'/api/v1/agents/updates/latest') -Headers $headers;if(-not $release -or -not $release.version -or -not $release.sha256){throw 'The server did not return valid release metadata.'};$downloadUrl=if($release.downloadUrl -match '^https?://'){$release.downloadUrl}else{$base+'/'+$release.downloadUrl.TrimStart('/')};Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -Headers $headers -OutFile $env:ASSETFLOW_DOWNLOAD_FILE;if((Get-Item -LiteralPath $env:ASSETFLOW_DOWNLOAD_FILE).Length -ne [long]$release.size){throw 'Downloaded Agent size does not match release metadata.'};$actual=(Get-FileHash -Algorithm SHA256 -LiteralPath $env:ASSETFLOW_DOWNLOAD_FILE).Hash;if($actual -ne $release.sha256){throw 'Downloaded Agent SHA-256 does not match release metadata.'};@{ApiUrl=$base;RegistrationToken=$registration;DeviceToken=$registered.deviceToken;AgentId=$registered.agentId;CollectionMinutes=60;UpdateCheckMinutes=5}|ConvertTo-Json|Set-Content -LiteralPath $env:ASSETFLOW_DOWNLOAD_CONFIG -Encoding UTF8;Write-Host ('Latest Agent version '+$release.version+' downloaded and verified.')"
if errorlevel 1 goto :failed
if not exist "%DOWNLOAD_FILE%" goto :failed
if not exist "%DOWNLOAD_CONFIG%" goto :failed

echo [2/6] Stopping and deleting the existing service...
sc.exe query "%SERVICE_NAME%" >nul 2>&1
if not errorlevel 1 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';$s=Get-Service -Name '%SERVICE_NAME%' -ErrorAction SilentlyContinue;if($s -and $s.Status -ne 'Stopped'){Stop-Service -Name '%SERVICE_NAME%' -Force;$s.WaitForStatus('Stopped',[TimeSpan]::FromSeconds(30))};$s=Get-Service -Name '%SERVICE_NAME%' -ErrorAction SilentlyContinue;if($s -and $s.Status -ne 'Stopped'){exit 1}"
  if errorlevel 1 goto :failed
  sc.exe delete "%SERVICE_NAME%" >nul 2>&1
  if errorlevel 1 goto :failed
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$limit=(Get-Date).AddSeconds(30);do{$s=Get-Service -Name '%SERVICE_NAME%' -ErrorAction SilentlyContinue;if(-not $s){exit 0};Start-Sleep -Milliseconds 500}while((Get-Date) -lt $limit);exit 1"
  if errorlevel 1 goto :failed
)

rem Stop a manually started or orphaned Agent process that may still lock the files.
taskkill.exe /F /IM "AssetFlow.Agent.exe" >nul 2>&1

echo [3/6] Removing the old executable, logs, and device identity...
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%"
if exist "%CONFIG_DIR%\agent.json" del /f /q "%CONFIG_DIR%\agent.json"
if exist "%INSTALL_DIR%" goto :failed

echo [4/6] Installing the downloaded Agent...
mkdir "%INSTALL_DIR%\logs" >nul 2>&1
mkdir "%CONFIG_DIR%" >nul 2>&1
move /y "%DOWNLOAD_FILE%" "%INSTALL_DIR%\AssetFlow.Agent.exe" >nul
if errorlevel 1 goto :failed

echo [5/6] Installing the registered device configuration...
move /y "%DOWNLOAD_CONFIG%" "%CONFIG_DIR%\agent.json" >nul
if errorlevel 1 goto :failed
set "REGISTRATION_TOKEN="
set "ASSETFLOW_SETUP_TOKEN="

echo [6/6] Creating and starting the new service and tray app...
sc.exe create "%SERVICE_NAME%" binPath= "\"%INSTALL_DIR%\AssetFlow.Agent.exe\"" start= auto DisplayName= "%DISPLAY_NAME%" >nul
if errorlevel 1 goto :failed
sc.exe description "%SERVICE_NAME%" "Collects PC inventory and checks verified release metadata for AssetFlow." >nul
sc.exe failure "%SERVICE_NAME%" reset= 86400 actions= restart/60000/restart/60000/restart/60000 >nul
sc.exe start "%SERVICE_NAME%" >nul
if errorlevel 1 goto :failed
reg.exe add "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /v "AssetFlowAgentTray" /t REG_SZ /d "\"%INSTALL_DIR%\AssetFlow.Agent.exe\" --tray" /f >nul
start "" "%INSTALL_DIR%\AssetFlow.Agent.exe" --tray

echo.
echo [OK] A clean Agent service and system tray app were installed and started.
echo The device was registered with the supplied token and will connect automatically.
echo Logs: %INSTALL_DIR%\logs
pause
exit /b 0

:failed
set "RESULT=%errorlevel%"
if "%RESULT%"=="0" set "RESULT=1"
del /f /q "%DOWNLOAD_FILE%" "%DOWNLOAD_CONFIG%" >nul 2>&1
set "REGISTRATION_TOKEN="
set "ASSETFLOW_SETUP_TOKEN="
echo.
echo [ERROR] Clean installation failed. Error code: %RESULT%
echo Check %INSTALL_DIR%\logs and Windows Event Viewer.
pause
exit /b %RESULT%
