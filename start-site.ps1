$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $root "vite-dev.log"
$err = Join-Path $root "vite-dev.err"
$vite = Join-Path $root "node_modules\.bin\vite.cmd"

Remove-Item -LiteralPath $out, $err -ErrorAction SilentlyContinue

Start-Process `
  -FilePath $vite `
  -ArgumentList @("--port=3000", "--host=0.0.0.0", "--clearScreen=false") `
  -WorkingDirectory $root `
  -RedirectStandardOutput $out `
  -RedirectStandardError $err `
  -WindowStyle Hidden

Write-Host "FocusApp is starting at http://localhost:3000"
Write-Host "Logs: $out"
