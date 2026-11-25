@echo off
setlocal DisableDelayedExpansion
rem AssetFlow Agent 0.3.0+ approved removal tool.
rem The Agent service is protected: even administrators cannot stop or delete it directly.
rem   1) Enter the removal code issued by an administrator in the AssetFlow console (works offline), or
rem   2) send a removal request; after an administrator approves it, the Agent removes itself within 5 minutes.
set "SERVICE_NAME=AssetFlowAgent"
set "INSTALL_DIR=%ProgramFiles%\AssetFlow\Agent"
set "CONFIG_DIR=%ProgramData%\AssetFlow"
set "REQUEST_FILE=%CONFIG_DIR%\uninstall-request.json"
set "RESULT_FILE=%CONFIG_DIR%\uninstall-result.json"

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting administrator privileges...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo.
echo AssetFlow Agent - Approved Removal
echo ==================================
sc.exe query "%SERVICE_NAME%" >nul 2>&1
if errorlevel 1 (
  echo The AssetFlow Agent service is not installed on this PC.
  pause
  exit /b 0
)
if not exist "%CONFIG_DIR%" (
  echo [ERROR] %CONFIG_DIR% was not found. Contact the IT administrator.
  pause
  exit /b 1
)
echo This PC's Agent can only be removed with administrator approval.
echo.
echo   1. Enter a removal code issued by the administrator (works without network)
echo   2. Send a removal request to the administrator
echo.
set "CHOICE="
set /p "CHOICE=Select 1 or 2: "
if "%CHOICE%"=="1" goto :code
if "%CHOICE%"=="2" goto :request
echo Cancelled.
pause
exit /b 1

:code
set "ASSETFLOW_CODE="
set /p "ASSETFLOW_CODE=Removal code (e.g. 493560-5881393028): "
if not defined ASSETFLOW_CODE goto :code
del /f /q "%RESULT_FILE%" >nul 2>&1
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$r=@{code=$env:ASSETFLOW_CODE.Trim();requestedBy=$env:USERDOMAIN+'\'+$env:USERNAME}|ConvertTo-Json;[IO.File]::WriteAllText($env:REQUEST_FILE,$r)"
if errorlevel 1 goto :writefail
echo Waiting for the Agent to verify the code...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$limit=(Get-Date).AddSeconds(120);do{Start-Sleep 2;if(-not (Get-Service -Name $env:SERVICE_NAME -ErrorAction SilentlyContinue)){Write-Host '[OK] The AssetFlow Agent was removed.';exit 0};if(Test-Path $env:RESULT_FILE){$x=Get-Content $env:RESULT_FILE -Raw|ConvertFrom-Json;if($x.status -ne 'UNINSTALLING'){Write-Host ('[REFUSED] '+$x.message);exit 2}}}while((Get-Date) -lt $limit);Write-Host '[WAIT] Removal is still in progress. Check Windows Services in a few minutes.';exit 3"
set "RESULT=%errorlevel%"
pause
exit /b %RESULT%

:request
set "ASSETFLOW_REASON="
set /p "ASSETFLOW_REASON=Reason for removal (e.g. PC return, reinstall): "
del /f /q "%RESULT_FILE%" >nul 2>&1
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$r=@{reason=$env:ASSETFLOW_REASON;requestedBy=$env:USERDOMAIN+'\'+$env:USERNAME}|ConvertTo-Json;[IO.File]::WriteAllText($env:REQUEST_FILE,$r)"
if errorlevel 1 goto :writefail
echo Sending the request through the Agent...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$limit=(Get-Date).AddSeconds(60);do{Start-Sleep 2;if(Test-Path $env:RESULT_FILE){$x=Get-Content $env:RESULT_FILE -Raw|ConvertFrom-Json;if($x.status -eq 'REQUESTED'){Write-Host ('[OK] Removal request #'+$x.requestId+' was sent. After an administrator approves it, the Agent removes itself within 5 minutes.');exit 0};Write-Host ('[ERROR] '+$x.message);exit 2}}while((Get-Date) -lt $limit);Write-Host '[WAIT] The Agent has not answered yet (it may be offline). Ask the administrator for a removal code.';exit 3"
set "RESULT=%errorlevel%"
pause
exit /b %RESULT%

:writefail
echo [ERROR] Could not hand the request to the Agent. Run this tool as administrator.
pause
exit /b 1
