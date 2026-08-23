@echo off
setlocal DisableDelayedExpansion
set "SERVICE_NAME=AssetFlowAgent"
set "INSTALL_DIR=%ProgramFiles%\AssetFlow\Agent"
set "CONFIG_DIR=%ProgramData%\AssetFlow"
set "PURGE_DATA=0"
if /i "%~1"=="/purge" set "PURGE_DATA=1"

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting administrator privileges...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '%~1' -Verb RunAs"
  exit /b
)

echo.
echo AssetFlow Agent Uninstaller
echo ===========================
echo [1/4] Stopping the Agent service...
sc.exe query "%SERVICE_NAME%" >nul 2>&1
if not errorlevel 1 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$s=Get-Service -Name '%SERVICE_NAME%' -ErrorAction SilentlyContinue;if($s -and $s.Status -ne 'Stopped'){Stop-Service -Name '%SERVICE_NAME%' -Force -ErrorAction SilentlyContinue;$s.WaitForStatus('Stopped',[TimeSpan]::FromSeconds(30))}"
)

echo [2/4] Removing service and system tray startup...
taskkill.exe /F /IM "AssetFlow.Agent.exe" >nul 2>&1
reg.exe delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /v "AssetFlowAgentTray" /f >nul 2>&1
reg.exe delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "AssetFlowAgentTray" /f >nul 2>&1
sc.exe query "%SERVICE_NAME%" >nul 2>&1
if not errorlevel 1 sc.exe delete "%SERVICE_NAME%" >nul 2>&1
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$limit=(Get-Date).AddSeconds(30);do{$s=Get-Service -Name '%SERVICE_NAME%' -ErrorAction SilentlyContinue;if(-not $s){exit 0};Start-Sleep -Milliseconds 500}while((Get-Date) -lt $limit);exit 1"
if errorlevel 1 goto :failed

echo [3/4] Removing installed Agent files...
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%"
if exist "%INSTALL_DIR%" goto :failed
for %%D in ("%ProgramFiles%\AssetFlow") do rd "%%~D" >nul 2>&1

echo [4/4] Processing local device data...
if "%PURGE_DATA%"=="1" (
  if exist "%CONFIG_DIR%" rmdir /s /q "%CONFIG_DIR%"
  if exist "%CONFIG_DIR%" goto :failed
  echo Local configuration, device token, and logs were removed.
) else (
  echo Local device identity was preserved in %CONFIG_DIR%.
  echo Run uninstall-service.bat /purge to remove it permanently.
)

echo.
echo [OK] AssetFlow Agent was uninstalled successfully.
pause
exit /b 0

:failed
echo.
echo [ERROR] Uninstallation did not complete. Close Agent processes and try again.
echo You can also inspect Windows Services for %SERVICE_NAME%.
pause
exit /b 1
