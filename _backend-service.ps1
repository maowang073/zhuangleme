# Backend service helper for 装了吗 launchers
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Ensure", "Status", "Stop", "Watch")]
  [string]$Action
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
$PidFile = Join-Path $Backend ".zhuangleme-backend.pid"
$LogFile = Join-Path $Backend ".zhuangleme-backend.log"
$ErrFile = Join-Path $Backend ".zhuangleme-backend.err.log"
$HealthUrl = "http://127.0.0.1:8000/api/health"
$Port = 8000

function Test-BackendRunning {
  try {
    $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
    return ($response.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Get-PortPids {
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
}

function Save-Pid([int]$ProcessId) {
  Set-Content -Path $PidFile -Value $ProcessId -Encoding ascii
}

function Read-SavedPid {
  if (-not (Test-Path $PidFile)) { return $null }
  $raw = (Get-Content -Path $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($raw -match '^\d+$') { return [int]$raw }
  return $null
}

function Stop-BackendService {
  $stopped = $false
  $saved = Read-SavedPid
  if ($saved) {
    try {
      Stop-Process -Id $saved -Force -ErrorAction Stop
      $stopped = $true
    } catch {}
  }

  foreach ($procId in (Get-PortPids)) {
    try {
      Stop-Process -Id $procId -Force -ErrorAction Stop
      $stopped = $true
    } catch {}
  }

  if (Test-Path $PidFile) { Remove-Item $PidFile -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
  return $stopped
}

function Start-BackendService {
  if (-not (Test-Path $Python)) {
    throw "Missing venv python: $Python"
  }

  if (Test-BackendRunning) {
    return "already"
  }

  # Clear stale listeners on 8000 before start
  foreach ($procId in (Get-PortPids)) {
    try { Stop-Process -Id $procId -Force -ErrorAction Stop } catch {}
  }

  $args = @(
    "-m", "uvicorn", "main:app",
    "--host", "127.0.0.1",
    "--port", "$Port"
  )

  $proc = Start-Process -FilePath $Python `
    -ArgumentList $args `
    -WorkingDirectory $Backend `
    -WindowStyle Hidden `
    -RedirectStandardOutput $LogFile `
    -RedirectStandardError $ErrFile `
    -PassThru

  Save-Pid $proc.Id

  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 400
    if (Test-BackendRunning) { return "started" }
  }

  throw "Backend started but health check failed. See log: $LogFile"
}

function Show-Banner {
  Write-Host ""
  Write-Host " ========================================"
  Write-Host "   Zhuangleme Backend Controller"
  Write-Host " ========================================"
  Write-Host ""
  Write-Host " Address : http://127.0.0.1:8000"
  Write-Host " Health  : $HealthUrl"
  Write-Host " Log     : $LogFile"
  Write-Host ""
  Write-Host " Close this window  => server keeps running"
  Write-Host " Press Ctrl+C       => stop the server"
  Write-Host " ----------------------------------------"
  Write-Host ""
}

switch ($Action) {
  "Status" {
    if (Test-BackendRunning) {
      Write-Host "RUNNING"
      exit 0
    }
    Write-Host "STOPPED"
    exit 1
  }
  "Ensure" {
    $result = Start-BackendService
    if ($result -eq "already") {
      Write-Host "[OK] Backend already running."
    } else {
      Write-Host "[OK] Backend started in background."
    }
    exit 0
  }
  "Stop" {
    if (Stop-BackendService) {
      Write-Host "[OK] Backend stopped."
    } else {
      Write-Host "[OK] Backend was not running."
    }
    exit 0
  }
  "Watch" {
    Show-Banner
    try {
      $state = Start-BackendService
      if ($state -eq "already") {
        Write-Host "[Status] Server is already RUNNING."
      } else {
        Write-Host "[Status] Server was stopped. Started successfully."
      }
      Write-Host ""
      Write-Host "Idle. Close window to keep running, or press Ctrl+C to stop."
      Write-Host ""

      # Quiet wait — no periodic status spam.
      while ($true) { Start-Sleep -Seconds 3600 }
    } finally {
      Write-Host ""
      Write-Host "[Ctrl+C] Stopping backend..."
      Stop-BackendService | Out-Null
      Write-Host "[OK] Backend stopped. You can close this window."
    }
  }
}
