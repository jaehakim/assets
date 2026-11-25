#Requires -RunAsAdministrator
# AssetFlow Agent 0.3.0+ approved removal (PowerShell). The service is protected; removal needs administrator approval.
#   .\uninstall-service.ps1 -Code 493560-5881393028     # offline code issued in the AssetFlow console
#   .\uninstall-service.ps1 -Reason 'PC return'          # removal request; approve it in the console
param([string]$Code, [string]$Reason)
$ErrorActionPreference = 'Stop'
$name = 'AssetFlowAgent'
$data = Join-Path $env:ProgramData 'AssetFlow'
$requestFile = Join-Path $data 'uninstall-request.json'
$resultFile = Join-Path $data 'uninstall-result.json'
if (-not (Get-Service $name -ErrorAction SilentlyContinue)) { Write-Host 'AssetFlow Agent is not installed.'; exit 0 }
if (-not $Code -and -not $Reason) { throw 'Specify -Code (offline removal code) or -Reason (removal request for administrator approval).' }
Remove-Item $resultFile -Force -ErrorAction SilentlyContinue
$who = "$env:USERDOMAIN\$env:USERNAME"
$body = if ($Code) { @{ code = $Code.Trim(); requestedBy = $who } } else { @{ reason = $Reason; requestedBy = $who } }
[IO.File]::WriteAllText($requestFile, ($body | ConvertTo-Json))
$limit = (Get-Date).AddSeconds($(if ($Code) { 120 } else { 60 }))
do {
    Start-Sleep 2
    if ($Code -and -not (Get-Service $name -ErrorAction SilentlyContinue)) { Write-Host '[OK] The AssetFlow Agent was removed.'; exit 0 }
    if (Test-Path $resultFile) {
        $x = Get-Content $resultFile -Raw | ConvertFrom-Json
        if (-not $Code -and $x.status -eq 'REQUESTED') { Write-Host "[OK] Removal request #$($x.requestId) sent. Approve it in the AssetFlow console; the Agent removes itself within 5 minutes."; exit 0 }
        if ($x.status -ne 'UNINSTALLING') { Write-Host "[REFUSED] $($x.message)"; exit 2 }
    }
} while ((Get-Date) -lt $limit)
Write-Host '[WAIT] No answer from the Agent yet. Check Windows Services or the AssetFlow console.'
exit 3
