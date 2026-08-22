@echo off
setlocal DisableDelayedExpansion
set "SERVICE_NAME=AssetFlowAgent"
set "DISPLAY_NAME=AssetFlow IT Asset Agent"
set "INSTALL_DIR=%ProgramFiles%\AssetFlow\Agent"
set "CONFIG_DIR=%ProgramData%\AssetFlow"
set "API_URL=https://assets.2734.store"

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting administrator privileges...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
if not exist "%~dp0AssetFlow.Agent.exe" (
  echo [ERROR] AssetFlow.Agent.exe was not found in this folder.
  pause
  exit /b 1
)

echo.
echo Existing AssetFlow Agent will be removed and installed as a new device.
echo API URL: %API_URL%
set /p "REGISTRATION_TOKEN=Enter the agent registration token: "
if not defined REGISTRATION_TOKEN (
  echo [ERROR] A registration token is required.
  pause
  exit /b 1
)

echo [1/5] Stopping and deleting the existing service...
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

echo [2/5] Removing the old executable, logs, and device identity...
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%"
if exist "%CONFIG_DIR%\agent.json" del /f /q "%CONFIG_DIR%\agent.json"
if exist "%INSTALL_DIR%" goto :failed

echo [3/5] Copying the new Agent...
mkdir "%INSTALL_DIR%\logs" >nul 2>&1
mkdir "%CONFIG_DIR%" >nul 2>&1
copy /y "%~dp0AssetFlow.Agent.exe" "%INSTALL_DIR%\AssetFlow.Agent.exe" >nul
if errorlevel 1 goto :failed

echo [4/5] Creating a clean configuration...
set "ASSETFLOW_SETUP_API_URL=%API_URL%"
set "ASSETFLOW_SETUP_TOKEN=%REGISTRATION_TOKEN%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$config=@{ApiUrl=$env:ASSETFLOW_SETUP_API_URL;RegistrationToken=$env:ASSETFLOW_SETUP_TOKEN;CollectionMinutes=60;UpdateCheckMinutes=5};$config|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $env:ProgramData 'AssetFlow\agent.json') -Encoding UTF8"
if errorlevel 1 goto :failed
set "REGISTRATION_TOKEN="
set "ASSETFLOW_SETUP_TOKEN="

echo [5/5] Creating and starting the new service...
sc.exe create "%SERVICE_NAME%" binPath= "\"%INSTALL_DIR%\AssetFlow.Agent.exe\"" start= auto DisplayName= "%DISPLAY_NAME%" >nul
if errorlevel 1 goto :failed
sc.exe description "%SERVICE_NAME%" "Collects PC inventory and checks verified release metadata for AssetFlow." >nul
sc.exe failure "%SERVICE_NAME%" reset= 86400 actions= restart/60000/restart/60000/restart/60000 >nul
sc.exe start "%SERVICE_NAME%" >nul
if errorlevel 1 goto :failed

echo.
echo [OK] A clean Agent was installed and started.
echo The device will register automatically on its first connection.
echo Logs: %INSTALL_DIR%\logs
pause
exit /b 0

:failed
set "RESULT=%errorlevel%"
echo.
echo [ERROR] Clean installation failed. Error code: %RESULT%
echo Check %INSTALL_DIR%\logs and Windows Event Viewer.
pause
exit /b %RESULT%
