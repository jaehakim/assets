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
echo AssetFlow Agent service installer
echo API URL: %API_URL%
set /p "REGISTRATION_TOKEN=Enter the agent registration token: "
if not defined REGISTRATION_TOKEN (
    echo [ERROR] A registration token is required.
    pause
    exit /b 1
)

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if errorlevel 1 goto :failed
if not exist "%CONFIG_DIR%" mkdir "%CONFIG_DIR%"
if errorlevel 1 goto :failed

copy /y "%~dp0AssetFlow.Agent.exe" "%INSTALL_DIR%\AssetFlow.Agent.exe" >nul
if errorlevel 1 goto :failed

set "ASSETFLOW_SETUP_API_URL=%API_URL%"
set "ASSETFLOW_SETUP_TOKEN=%REGISTRATION_TOKEN%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$config = @{ ApiUrl = $env:ASSETFLOW_SETUP_API_URL; RegistrationToken = $env:ASSETFLOW_SETUP_TOKEN; CollectionMinutes = 60 }; $config | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $env:ProgramData 'AssetFlow\agent.json') -Encoding UTF8"
if errorlevel 1 goto :failed
set "REGISTRATION_TOKEN="
set "ASSETFLOW_SETUP_TOKEN="

sc.exe query "%SERVICE_NAME%" >nul 2>&1
if not errorlevel 1 (
    sc.exe stop "%SERVICE_NAME%" >nul 2>&1
    sc.exe delete "%SERVICE_NAME%" >nul
    timeout /t 2 /nobreak >nul
)

sc.exe create "%SERVICE_NAME%" binPath= "\"%INSTALL_DIR%\AssetFlow.Agent.exe\"" start= auto DisplayName= "%DISPLAY_NAME%" >nul
if errorlevel 1 goto :failed

sc.exe description "%SERVICE_NAME%" "Collects and sends PC inventory to AssetFlow." >nul
sc.exe start "%SERVICE_NAME%" >nul
if errorlevel 1 goto :failed

echo.
echo [OK] %DISPLAY_NAME% was installed and started.
echo Service name: %SERVICE_NAME%
pause
exit /b 0

:failed
echo.
echo [ERROR] Service installation or startup failed. Error code: %errorlevel%
pause
exit /b 1
