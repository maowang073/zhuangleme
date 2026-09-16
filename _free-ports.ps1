param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [int[]]$Ports
)

foreach ($port in $Ports) {
  $pids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($procId in $pids) {
    try {
      Stop-Process -Id $procId -Force -ErrorAction Stop
      Write-Host ("Freed port {0} (PID {1})" -f $port, $procId)
    } catch {
      # ignore processes that already exited
    }
  }
}
