# Desktop app helper: ensure backend, start/stop app processes
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Watch")]
  [string]$Action
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Desktop = Join-Path $Root "desktop"
$PidFile = Join-Path $Desktop ".zhuangleme-app.pid"
$LogFile = Join-Path $Desktop ".zhuangleme-app.log"
$ErrFile = Join-Path $Desktop ".zhuangleme-app.err.log"
$BackendHelper = Join-Path $Root "_backend-service.ps1"

function Test-PortListen([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Stop-Tree([int]$ProcessId) {
  try {
    & taskkill /PID $ProcessId /T /F 2>$null | Out-Null
  } catch {}
}

function Stop-App {
  $saved = $null
  if (Test-Path $PidFile) {
    $raw = Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($raw -match '^\d+$') { $saved = [int]$raw }
  }
  if ($saved) { Stop-Tree $saved }

  Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Tree $_ }

  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'electron' -and $_.CommandLine -match 'zhuangleme|desktop' } |
    ForEach-Object { Stop-Tree $_.ProcessId }

  if (Test-Path $PidFile) { Remove-Item $PidFile -Force -ErrorAction SilentlyContinue }
}

function Start-App {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm not found. Install Node.js first."
  }

  # Free only frontend port; backend is managed separately.
  Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Tree $_ }

  $npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue)
  if (-not $npmCmd) { $npmCmd = Get-Command npm }
  $proc = Start-Process -FilePath $npmCmd.Source `
    -ArgumentList "run","dev" `
    -WorkingDirectory $Desktop `
    -WindowStyle Hidden `
    -RedirectStandardOutput $LogFile `
    -RedirectStandardError $ErrFile `
    -PassThru

  Set-Content -Path $PidFile -Value $proc.Id -Encoding ascii

  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-PortListen 5173) { return }
  }
  throw "App started but port 5173 is not ready. See log: $LogFile"
}

Write-Host ""
Write-Host " ========================================"
Write-Host "   Zhuangleme App Launcher"
Write-Host " ========================================"
Write-Host ""
Write-Host " App     : http://localhost:5173"
Write-Host " Backend : http://127.0.0.1:8000"
Write-Host ""
Write-Host " Close this window  => app + backend keep running"
Write-Host " Press Ctrl+C       => stop app + backend"
Write-Host " ----------------------------------------"
Write-Host ""

try {
  Write-Host "[1/2] Checking backend..."
  & powershell -NoProfile -ExecutionPolicy Bypass -File $BackendHelper -Action Ensure
  if ($LASTEXITCODE -ne 0) { throw "Failed to ensure backend is running." }

  Write-Host "[2/2] Checking desktop app..."
  if (Test-PortListen 5173) {
    Write-Host "[Status] Desktop app is already RUNNING."
  } else {
    Write-Host "[Status] Desktop app was stopped. Starting..."
    Start-App
    Write-Host "[OK] Desktop app started."
  }

  Write-Host ""
  Write-Host "Idle. Close window to keep running, or press Ctrl+C to stop app + backend."
  Write-Host ""

  # Quiet wait — no periodic status spam.
  while ($true) { Start-Sleep -Seconds 3600 }
} finally {
  Write-Host ""
  Write-Host "[Ctrl+C] Stopping desktop app and backend..."
  Stop-App
  & powershell -NoProfile -ExecutionPolicy Bypass -File $BackendHelper -Action Stop | Out-Null
  Write-Host "[OK] Stopped. You can close this window."
}
