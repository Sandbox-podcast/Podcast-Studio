# HW-encode check sampler v3 (Windows, PowerShell 5 compatible). One JSON line per ~1 s on stdout. Read-only.
# Why v3: on the laptop the Intel Iris Xe (LUID ..._0x0001163E) exposes NO 'VideoEncode' engine (only
# VideoDecode eng1/eng4, VideoProcessing eng3, 3D, Copy); QuickSync encode likely shows under VideoDecode.
# VideoEncode exists only on the RTX 3070 (LUID ..._0x00012950). So we sample every Video* engine + 3D.
# Fields per sample:
#   procs, treeCpuPctOneCore, treeCpuPctMachine : CPU of OUR browser tree (RootPid + descendants; RootPid 0 = none)
#   systemCpuPct                                 : whole-machine busy %
#   fmt.perLuidType  {"<luid>|<engtype>": sum}   : Win32_PerfFormattedData_..._GPUEngine UtilizationPercentage, summed over all PIDs
#   fmt.perLuidEng   {"<luid>|eng<N>|<engtype>": sum}   (distinguishes e.g. VideoDecode eng1 vs eng4)
#   raw.perLuidType / raw.perLuidEng             : same from Win32_PerfRawData_... as raw delta (100ns timer) = cross-check
#   tree.perLuidType {"<luid>|<engtype>": sum}   : raw-delta, OUR tree PIDs only
#   tree.perPid      {"<pid>": {"<luid>|<engtype>": u}} : raw-delta, our tree PIDs, nonzero only
#   pidNames         {"<pid>": {name, inTree}}   : Get-Process names for PIDs active (>0.5 %) on any Video* engine
#                                                  (3D-only PIDs omitted: dwm & co. are always busy on 3D)
# CIM classes only (Get-Counter / typeperf counter names are localized on French Windows).
param([int]$RootPid = 0, [int]$IntervalMs = 1000)
$ErrorActionPreference = 'SilentlyContinue'
$cores = [Environment]::ProcessorCount
$prevProc = @{}; $prevSys = $null; $prevRaw = @{}; $names = @{}
$engFilter = "Name LIKE '%engtype_Video%' OR Name LIKE '%engtype_3D'"
$rx = '^pid_(\d+)_luid_(0x[0-9A-Fa-f]+_0x[0-9A-Fa-f]+)_phys_\d+_eng_(\d+)_engtype_(.+)$'
$sw = [Diagnostics.Stopwatch]::StartNew()

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
    if ($gp) { $names[$procId] = $gp.ProcessName } else { $names[$procId] = '?' }
  }
  return $names[$procId]
}

function Add-To($h, [string]$k, [double]$v) { $h[$k] = [double]($h[$k]) + $v }

function Round-Map($h) {
  $o = @{}
  foreach ($k in $h.Keys) { $o[$k] = [math]::Round([double]$h[$k], 1) }
  return $o
}

while ($true) {
  $t0 = $sw.ElapsedMilliseconds
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
  # --- GPU engines, formatted, all PIDs ---
  $fPerType = @{}; $fPerEng = @{}; $active = @{}
  $fmt = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -Filter $engFilter -Property Name, UtilizationPercentage
  foreach ($e in $fmt) {
    if ($e.Name -match $rx) {
      $procId = [int]$Matches[1]; $luid = $Matches[2]; $eng = $Matches[3]; $typ = $Matches[4]; $u = [double]$e.UtilizationPercentage
      Add-To $fPerType "$luid|$typ" $u
      Add-To $fPerEng "$luid|eng$eng|$typ" $u
      if (($u -gt 0) -and ($typ -ne '3D')) { $active["$procId"] = $true }
    }
  }
  # --- GPU engines, raw delta, all PIDs + our tree ---
  $rPerType = @{}; $rPerEng = @{}; $tPerType = @{}; $tPerPid = @{}
  $raw = Get-CimInstance Win32_PerfRawData_GPUPerformanceCounters_GPUEngine -Filter $engFilter -Property Name, UtilizationPercentage, Timestamp_Sys100NS
  foreach ($e in $raw) {
    if ($e.Name -match $rx) {
      $procId = [int]$Matches[1]; $luid = $Matches[2]; $eng = $Matches[3]; $typ = $Matches[4]; $k = $e.Name
      if ($prevRaw.ContainsKey($k)) {
        $dt = [double]($e.Timestamp_Sys100NS - $prevRaw[$k].ts)
        if ($dt -gt 0) {
          $u = 100.0 * [double]($e.UtilizationPercentage - $prevRaw[$k].u) / $dt
          if ($u -lt 0) { $u = 0.0 }
          Add-To $rPerType "$luid|$typ" $u
          Add-To $rPerEng "$luid|eng$eng|$typ" $u
          if (($u -gt 0.5) -and ($typ -ne '3D')) { $active["$procId"] = $true }
          if ($tree.ContainsKey($procId)) {
            Add-To $tPerType "$luid|$typ" $u
            if ($u -gt 0.05) {
              if (-not $tPerPid.ContainsKey("$procId")) { $tPerPid["$procId"] = @{} }
              Add-To $tPerPid["$procId"] "$luid|$typ" $u
            }
          }
        }
      }
      $prevRaw[$k] = @{ u = $e.UtilizationPercentage; ts = $e.Timestamp_Sys100NS }
    }
  }
  # --- names for active PIDs (Video* engines) + our tree PIDs with GPU activity ---
  $pidNames = @{}
  foreach ($k in (@($active.Keys) + @($tPerPid.Keys))) {
    $pidNames[$k] = @{ name = (Get-PName ([int]$k)); inTree = $tree.ContainsKey([int]$k) }
  }
  $tPid = @{}
  foreach ($k in $tPerPid.Keys) { $tPid[$k] = (Round-Map $tPerPid[$k]) }
  $o = [ordered]@{
    procs = $n; treeCpuPctOneCore = [math]::Round($sumPct, 1); treeCpuPctMachine = [math]::Round($sumPct / $cores, 1)
    systemCpuPct = $sysPct
    fmt = [ordered]@{ perLuidType = (Round-Map $fPerType); perLuidEng = (Round-Map $fPerEng) }
    raw = [ordered]@{ perLuidType = (Round-Map $rPerType); perLuidEng = (Round-Map $rPerEng) }
    tree = [ordered]@{ perLuidType = (Round-Map $tPerType); perPid = $tPid }
    pidNames = $pidNames; cores = $cores; sampleMs = [int]($sw.ElapsedMilliseconds - $t0)
  }
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 6)); [Console]::Out.Flush()
  $left = $IntervalMs - [int]($sw.ElapsedMilliseconds - $t0)
  if ($left -gt 50) { Start-Sleep -Milliseconds $left }
}
