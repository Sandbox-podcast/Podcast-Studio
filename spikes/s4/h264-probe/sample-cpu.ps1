# Probe sampler v2 (Windows). One JSON line per ~1 s on stdout. Read-only (CIM queries + Get-Process).
#  tree*            : CPU of the probe's OWN Edge tree (RootPid + descendants); RootPid 0 = no tree (idle baseline)
#  systemCpuPct     : whole-machine busy %
#  gpuVideoEncodePct: VideoEncode engine util, OUR tree PIDs only (raw-delta)
#  vencAll          : UNFILTERED VideoEncode over ALL PIDs / adapters:
#       fmtSum / fmtPerLuid / fmtPerPid  from Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine
#       rawSum / rawPerPid               raw-delta cross-check (Win32_PerfRawData_..._GPUEngine)
#  pidNames         : Get-Process names for any PID with VideoEncode > 0 (cached)
# Uses CIM classes (not Get-Counter/typeperf: counter names are localized on French Windows).
param([int]$RootPid = 0, [int]$IntervalMs = 1000)
$ErrorActionPreference = 'SilentlyContinue'
$cores = [Environment]::ProcessorCount
$prevProc = @{}; $prevSys = $null; $prevRaw = @{}; $names = @{}
$encFilter = "Name LIKE '%engtype_VideoEncode'"
$rx = '^pid_(\d+)_luid_(0x[0-9A-Fa-f]+_0x[0-9A-Fa-f]+)_'

function Get-Tree([int]$root) {
  $set = @{}
  if ($root -le 0) { return $set }
  $set[$root] = $true
  $all = Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" -Property ProcessId, ParentProcessId
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($p in $all) {
      if (-not $set.ContainsKey([int]$p.ProcessId) -and $set.ContainsKey([int]$p.ParentProcessId)) { $set[[int]$p.ProcessId] = $true; $changed = $true }
    }
  }
  return $set
}

function Get-PName([int]$procId) {
  if (-not $names.ContainsKey($procId)) {
    $gp = Get-Process -Id $procId -ErrorAction SilentlyContinue
    $names[$procId] = if ($gp) { $gp.ProcessName } else { '?' }
  }
  return $names[$procId]
}

while ($true) {
  $tree = Get-Tree $RootPid
  # --- CPU of our tree ---
  $sumPct = 0.0; $n = 0
  if ($tree.Count -gt 0) {
    $procs = Get-CimInstance Win32_PerfRawData_PerfProc_Process -Property IDProcess, PercentProcessorTime, Timestamp_Sys100NS |
      Where-Object { $tree.ContainsKey([int]$_.IDProcess) }
    foreach ($p in $procs) {
      $id = [int]$p.IDProcess; $n++
      if ($prevProc.ContainsKey($id)) {
        $dt = [double]($p.Timestamp_Sys100NS - $prevProc[$id].ts)
        if ($dt -gt 0) { $sumPct += 100.0 * [double]($p.PercentProcessorTime - $prevProc[$id].cpu) / $dt }
      }
      $prevProc[$id] = @{ cpu = $p.PercentProcessorTime; ts = $p.Timestamp_Sys100NS }
    }
  }
  # --- machine CPU ---
  $sys = Get-CimInstance Win32_PerfRawData_PerfOS_Processor -Filter "Name='_Total'" -Property PercentProcessorTime, Timestamp_Sys100NS
  $sysPct = $null
  if ($prevSys) {
    $dt = [double]($sys.Timestamp_Sys100NS - $prevSys.ts)
    if ($dt -gt 0) { $sysPct = [math]::Round(100.0 * (1.0 - [double]($sys.PercentProcessorTime - $prevSys.cpu) / $dt), 1) }
  }
  $prevSys = @{ cpu = $sys.PercentProcessorTime; ts = $sys.Timestamp_Sys100NS }
  # --- VideoEncode, ALL PIDs: formatted (as requested) ---
  $fmtSum = 0.0; $fmtPerLuid = @{}; $fmtPerPid = @{}
  $fmt = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -Filter $encFilter -Property Name, UtilizationPercentage
  foreach ($e in $fmt) {
    if ($e.Name -match $rx) {
      $procId = [int]$Matches[1]; $luid = $Matches[2]; $u = [double]$e.UtilizationPercentage
      $fmtSum += $u
      $fmtPerLuid[$luid] = [double]($fmtPerLuid[$luid]) + $u
      $fmtPerPid["$procId"] = [double]($fmtPerPid["$procId"]) + $u
    }
  }
  # --- VideoEncode, ALL PIDs: raw-delta cross-check (+ our-tree subset) ---
  $rawSum = 0.0; $rawPerPid = @{}; $treeEnc = $null
  $raw = Get-CimInstance Win32_PerfRawData_GPUPerformanceCounters_GPUEngine -Filter $encFilter -Property Name, UtilizationPercentage, Timestamp_Sys100NS
  foreach ($e in $raw) {
    if ($e.Name -match $rx) {
      $procId = [int]$Matches[1]; $k = $e.Name
      if ($prevRaw.ContainsKey($k)) {
        $dt = [double]($e.Timestamp_Sys100NS - $prevRaw[$k].ts)
        if ($dt -gt 0) {
          $u = 100.0 * [double]($e.UtilizationPercentage - $prevRaw[$k].u) / $dt
          $rawSum += $u
          $rawPerPid["$procId"] = [double]($rawPerPid["$procId"]) + $u
          if ($tree.ContainsKey($procId)) { if ($null -eq $treeEnc) { $treeEnc = 0.0 }; $treeEnc += $u }
        }
      }
      $prevRaw[$k] = @{ u = $e.UtilizationPercentage; ts = $e.Timestamp_Sys100NS }
    }
  }
  # --- names for active PIDs ---
  $pidNames = @{}
  foreach ($k in @($fmtPerPid.Keys) + @($rawPerPid.Keys)) {
    if (([double]$fmtPerPid[$k] -gt 0) -or ([double]$rawPerPid[$k] -gt 0.5)) {
      $pidNames[$k] = @{ name = (Get-PName ([int]$k)); inTree = $tree.ContainsKey([int]$k) }
    }
  }
  $r1 = { param($h) $o = @{}; foreach ($k in $h.Keys) { $o[$k] = [math]::Round([double]$h[$k], 1) }; $o }
  $o = [ordered]@{
    procs = $n; treeCpuPctOneCore = [math]::Round($sumPct, 1); treeCpuPctMachine = [math]::Round($sumPct / $cores, 1)
    systemCpuPct = $sysPct
    gpuVideoEncodePct = $(if ($null -ne $treeEnc) { [math]::Round($treeEnc, 1) } else { $null })
    vencAll = [ordered]@{ fmtSum = [math]::Round($fmtSum, 1); fmtPerLuid = (& $r1 $fmtPerLuid); fmtPerPid = (& $r1 $fmtPerPid)
                          rawSum = [math]::Round($rawSum, 1); rawPerPid = (& $r1 $rawPerPid) }
    pidNames = $pidNames; cores = $cores
  }
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 5)); [Console]::Out.Flush()
  Start-Sleep -Milliseconds $IntervalMs
}
