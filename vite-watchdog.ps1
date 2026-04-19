param(
  [Parameter(Mandatory = $true)]
  [string]$Root
)

$ErrorActionPreference = "Continue"

$port = 3000
$out = Join-Path $Root "vite-dev.log"
$err = Join-Path $Root "vite-dev.err"
$watchdogLog = Join-Path $Root "vite-watchdog.log"
$vite = Join-Path $Root "node_modules\.bin\vite.cmd"
$pidFile = Join-Path $Root ".vite-dev.pid"

function Write-WatchdogLog {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $watchdogLog -Value "[$timestamp] $Message"
}

function Get-ViteProcess {
  if (-not (Test-Path -LiteralPath $pidFile)) {
    return $null
  }

  $rawPid = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  $processId = 0
  if (-not [int]::TryParse($rawPid, [ref]$processId)) {
    return $null
  }

  return Get-Process -Id $processId -ErrorAction SilentlyContinue
}

function Test-SiteOnline {
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:$port" -UseBasicParsing -TimeoutSec 3
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Start-Vite {
  $current = Get-ViteProcess
  if ($current) {
    return
  }

  Write-WatchdogLog "Starting Vite on port $port"
  $process = Start-Process `
    -FilePath $vite `
    -ArgumentList @("--port=$port", "--host=0.0.0.0", "--clearScreen=false") `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $out `
    -RedirectStandardError $err `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -LiteralPath $pidFile -Value $process.Id
}

Write-WatchdogLog "Watchdog started for $Root"

while ($true) {
  if (-not (Test-SiteOnline)) {
    $current = Get-ViteProcess
    if ($current -and $current.HasExited) {
      Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
    }
    Start-Vite
  }

  Start-Sleep -Seconds 8
}
