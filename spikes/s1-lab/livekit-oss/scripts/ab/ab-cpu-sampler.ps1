# Browser CPU sampler for S1 A/B. Sums CPU of all Edge/Chrome processes whose command line contains a
# marker (the per-condition --user-data-dir), so the user's own Edge is excluded. Also logs total CPU and
# best-effort GPU VideoEncode engine utilization (HW encoder load is NOT in process CPU).
param(
  [string]$Markers,
  [string]$OutCsv,
  [int]$IntervalMs = 2000,
  [int]$DurationSec = 200,
  [string]$ProcName = 'msedge.exe'
)
$ErrorActionPreference = 'SilentlyContinue'
$markerList = $Markers -split ','
$cores = [Environment]::ProcessorCount
'ts_paris,marker,n_procs,cpu_pct_machine,cpu_pct_one_core,total_cpu_pct,gpu_videoencode_pct' | Set-Content -Encoding utf8 $OutCsv
$prev = @{}; $pidMap = @{}; $i = 0
$end = (Get-Date).AddSeconds($DurationSec)
$sw = [Diagnostics.Stopwatch]::StartNew(); $lastMs = 0
while ((Get-Date) -lt $end) {
  if ($i % 5 -eq 0) {
    $procs = Get-CimInstance Win32_Process -Filter "Name='$ProcName'" | Select-Object ProcessId, CommandLine
    foreach ($m in $markerList) { $pidMap[$m] = @($procs | Where-Object { $_.CommandLine -like "*$m*" } | ForEach-Object { $_.ProcessId }) }
  }
  $nowMs = $sw.ElapsedMilliseconds; $wall = [math]::Max(1, $nowMs - $lastMs); $lastMs = $nowMs
  $total = (Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime
  $gpu = ''
  try {
    $eng = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine | Where-Object { $_.Name -like '*engtype_VideoEncode*' }
    if ($eng) { $gpu = ($eng | Measure-Object -Property UtilizationPercentage -Sum).Sum }
  } catch {}
  $ts = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss.fff'
  foreach ($m in $markerList) {
    $ids = $pidMap[$m]
    $ms = 0
    if ($ids.Count) { foreach ($p in (Get-Process -Id $ids)) { $ms += $p.TotalProcessorTime.TotalMilliseconds } }
    $one = ''; $mach = ''
    if ($prev.ContainsKey($m) -and $i -gt 0) {
      $d = [math]::Max(0, $ms - $prev[$m])
      $one = [math]::Round(100 * $d / $wall, 1); $mach = [math]::Round($one / $cores, 1)
    }
    $prev[$m] = $ms
    Add-Content -Encoding utf8 $OutCsv "$ts,$m,$($ids.Count),$mach,$one,$total,$gpu"
  }
  $i++
  Start-Sleep -Milliseconds $IntervalMs
}
