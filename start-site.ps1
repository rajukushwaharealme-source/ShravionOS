$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$watchdog = Join-Path $root "vite-watchdog.ps1"
$watchdogLog = Join-Path $root "vite-watchdog.log"

$existingWatchdog = Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine -like "*vite-watchdog.ps1*" -and
    $_.CommandLine -like "*$root*"
  }

if ($existingWatchdog) {
  Write-Host "ShravionOS is already being kept online at http://localhost:3000"
  Write-Host "Watchdog log: $watchdogLog"
  exit 0
}

Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$watchdog`" -Root `"$root`"" `
  -WorkingDirectory $root `
  -WindowStyle Hidden

Write-Host "ShravionOS is starting at http://localhost:3000"
Write-Host "Watchdog log: $watchdogLog"
