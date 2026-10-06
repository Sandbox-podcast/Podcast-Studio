# S1 laptop cam runs (real LifeCam, S4 rec ON via Media drop-in :3320, VP8 default, warmup 20 s / window 120 s).
# Two modes:
#  * PAIR (default, 11:31 setup): ab-cam-2L-on then ab-cam-3L-on, sample 2000 ms, with desktop-ai publishing take4-raw.webm as
#    LAN pub2 in the SAME room; laptop adds ab-sub-x (pinned HIGH, subscribes only to pub2) and records <cond>-sub-x-rx.webm.
#    Solo pair (11:50 setup): -Room '' -Pub2Id ''  (empty = env var removed -> per-cond room, no pub2, no sub-x).
#  * SEQUENCE (-Sequence, solo): runs labelled 2L-a,3L-a,2L-b,3L-b (= ab-cam-2L-on / ab-cam-3L-on), getStats sampled every
#    -SampleMs (default 1000 in sequence mode), CPU sampler every -CpuSampleMs (2000, as in earlier runs), -PauseSec (60) idle
#    pause between runs, unique room s1-seq-<label>-<HHmmss> + output folder <pairDir>\<label> per run, no pub2 unless -Pub2Id
#    is passed explicitly. If the webcam is held (or a Vision/Media runner is active) before a run, the sequence STOPS cleanly
#    (remaining runs logged NOT RUN).
# Before EACH run: webcam must be free (no app currently using it per CapabilityAccessManager) and no Vision/Media python/node
# runner may be active. Never touches the user's Edge (test Edge uses %TEMP%\s1ab-* profiles).
# pair.log: start/stop wall times (Paris, box-local clock of the laptop) of every run + RTC window from conditions-timestamps.csv.
# -DryParse: parse-only (node AB_DRY=1 per run) + plan + duration estimate, launches nothing. DO NOT RUN without lead GO.
param(
  [switch]$GoConfirmed, [switch]$DryParse, [switch]$Sequence,
  [string]$Conds = 'ab-cam-2L-on,ab-cam-3L-on',
  [string]$SeqLabels = '2L-a,3L-a,2L-b,3L-b',
  [int]$PauseSec = 60,
  [int]$SampleMs = 0,          # 0 = 1000 in -Sequence mode, 2000 otherwise
  [int]$CpuSampleMs = 2000,
  [string]$Room = ('s1-lan-pair-' + (Get-Date -Format HHmm)),
  [string]$Pub2Id = 'pub2-desktop-ai',
  [int]$IdleSec = 15,
  [string]$Lab = 'C:\Users\azero\s1-livekit-oss',
  [string]$SimulateCamBusyAt = ''   # TEST ONLY: pretend the webcam is held before this label (checks the clean abort, launches nothing)
)
$ErrorActionPreference = 'Continue'
$here = $PSScriptRoot
$node = 'C:\Program Files\nodejs\node.exe'; $nvm = Join-Path $env:APPDATA 'nvm\v20.11.0'; if (Test-Path (Join-Path $nvm 'node.exe')) { $node = Join-Path $nvm 'node.exe' }
if ($Sequence -and -not $PSBoundParameters.ContainsKey('Pub2Id')) { $Pub2Id = '' }   # sequence = solo by default
if ($SampleMs -le 0) { $SampleMs = $(if ($Sequence) { 1000 } else { 2000 }) }
$WarmupSec = 20; $RecSec = 120
$dirPrefix = $(if ($Sequence) { 'seq' } else { 'pair' })
# run list: label + cond
$runs = @()
if ($Sequence) {
  foreach ($l in ($SeqLabels -split ',')) {
    $l = $l.Trim(); if (-not $l) { continue }
    if ($l -notmatch '^([23])L-[A-Za-z0-9]+$') { throw "bad sequence label '$l' (expected 2L-x or 3L-x)" }
    $runs += [pscustomobject]@{ Label = $l; Cond = "ab-cam-$($Matches[1])L-on" }
  }
} else {
  foreach ($c in ($Conds -split ',')) { $c = $c.Trim(); if ($c) { $runs += [pscustomobject]@{ Label = $c; Cond = $c } } }
}
function Set-RunEnv([string]$cond, [string]$room) {
  foreach ($v in 'OUT_DIR','COOLDOWN_S','SAMPLE_MS','CPU_SAMPLE_MS','HEADLESS','FAKE_MEDIA','CHROME_PATH','SUB_REC','UNLOCK_SUBS','CONDS','CODEC','AB_GO','AB_DRY','IDLE_S','ROOM','PUB2_ID','PUB2_WAIT_S') { Remove-Item "env:$v" -ErrorAction SilentlyContinue }
  $env:CODEC = 'vp8'; $env:REC_S = "$RecSec"; $env:WARMUP_S = "$WarmupSec"; $env:SAMPLE_MS = "$SampleMs"; $env:CPU_SAMPLE_MS = "$CpuSampleMs"; $env:IDLE_S = "$IdleSec"
  $env:HARNESS = 'http://localhost:5190'; $env:AB_PATH = '/ab/index.html'; $env:S4_BASE = 'http://127.0.0.1:3320'
  $env:ROOM = $room; $env:PUB2_ID = $Pub2Id; $env:PUB2_WAIT_S = '60'; $env:CONDS = $cond   # '' removes the variable (PS 5.1)
}
function Get-RunRoom($r) { if ($Sequence) { return "s1-seq-$($r.Label)-" + (Get-Date -Format HHmmss) } else { return $Room } }
function Test-CamBusy {
  # LastUsedTimeStop = 0 while an app is using the webcam (desktop apps under NonPackaged, Store apps directly)
  $base = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam'
  $busy = @()
  foreach ($k in @(Get-ChildItem $base -ErrorAction SilentlyContinue) + @(Get-ChildItem "$base\NonPackaged" -ErrorAction SilentlyContinue)) {
    $p = Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue
    if ($p -and $null -ne $p.LastUsedTimeStart -and $p.LastUsedTimeStart -gt 0 -and $p.LastUsedTimeStop -eq 0) { $busy += $k.PSChildName }
  }
  return $busy
}
function Get-Blockers {
  # Vision/Media python or node runners (a plain `python -m http.server` file server is logged, not blocking)
  $b = @()
  $keep = @(Get-NetTCPConnection -State Listen -LocalPort 3320 -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess })  # Media's S4 drop-in (required)
  foreach ($p in Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^python' -or $_.Name -eq 'node.exe' }) {
    $c = "$($p.CommandLine)"
    if ($c -match 'http\.server') { continue }
    if ($p.ProcessId -in $keep) { continue }
    $b += "$($p.ProcessId) $($p.Name) $($c.Substring(0,[Math]::Min(140,$c.Length)))"
  }
  return $b
}
# per run: idle CPU 15 s + preflight/launch/join ~15 s + warmup + window + stop/save ~5 s + cooldown 10 s (11:50 pair: 190 s/run)
$perRunSec = $IdleSec + 15 + $WarmupSec + $RecSec + 5 + 10
$estSec = $runs.Count * ($perRunSec + 10) + [Math]::Max(0, $runs.Count - 1) * $(if ($Sequence) { $PauseSec } else { 0 })
if ($DryParse) {
  $mode = $(if ($Sequence) { 'SEQUENCE' } else { 'PAIR' })
  Write-Host "[dry] mode=$mode runs=$($runs.Count) sampleMs=$SampleMs cpuSampleMs=$CpuSampleMs pauseSec=$(if ($Sequence) { $PauseSec } else { 0 }) pub2=$(if ($Pub2Id) { $Pub2Id } else { '(none)' }) est_total=$([Math]::Round($estSec/60,1)) min (~$perRunSec s/run)"
  Write-Host "[dry] cam_busy_now=[$((Test-CamBusy) -join ';')] blockers_now=[$((Get-Blockers) -join ' | ')]"
  $i = 0
  foreach ($r in $runs) {
    $i++; $rm = Get-RunRoom $r
    Write-Host "[dry] run $i/$($runs.Count) label=$($r.Label) cond=$($r.Cond) room=$(if ($rm) { $rm } else { '(per-cond)' }) out=$dirPrefix-<stamp>\$($r.Label)$(if ($Sequence -and $i -lt $runs.Count) { " then pause ${PauseSec}s" })"
    Set-RunEnv $r.Cond $rm; $env:AB_DRY = '1'
    & $node (Join-Path $here 'ab-laptop.mjs')
    Remove-Item env:AB_DRY -ErrorAction SilentlyContinue
  }
  return
}
if (-not $GoConfirmed) { throw 'Refusing: pass -GoConfirmed only after the lead GO.' }

$ab = Join-Path $Lab 'public\ab'; New-Item -ItemType Directory -Force -Path $ab | Out-Null
Copy-Item (Join-Path $here 'harness.js') (Join-Path $ab 'harness.js') -Force
(Get-Content (Join-Path $here 'index.html') -Raw).Replace('src="/harness.js"', 'src="/ab/harness.js"') | Set-Content -Encoding utf8 (Join-Path $ab 'index.html')
$stamp = Get-Date -Format yyyyMMdd-HHmmss
$pairDir = Join-Path $here "$dirPrefix-$stamp"; New-Item -ItemType Directory -Force -Path $pairDir | Out-Null
$plog = Join-Path $pairDir 'pair.log'
$L = { param($m) $l = "[$((Get-Date).ToString('yyyy-MM-ddTHH:mm:ss.fff'))] $m"; Write-Host $l; Add-Content -Encoding utf8 $plog $l }
& $L "$(if ($Sequence) { 'sequence' } else { 'pair' }) start labels=$(($runs | ForEach-Object { $_.Label }) -join ',') pub2=$Pub2Id sampleMs=$SampleMs cpuSampleMs=$CpuSampleMs pauseSec=$(if ($Sequence) { $PauseSec } else { 0 }) est_total_s=$estSec"
$i = 0; $stopped = $false
foreach ($r in $runs) {
  $i++
  if ($stopped) { & $L "$($r.Label) NOT RUN (sequence stopped)"; continue }
  $busy = @(Test-CamBusy); $blk = @(Get-Blockers)
  if ($SimulateCamBusyAt -and $r.Label -eq $SimulateCamBusyAt) { $busy += 'SIMULATED-TEST' }
  & $L "$($r.Label) precheck cam_busy=[$($busy -join ';')] blockers=[$($blk -join ' | ')]"
  if ($busy.Count -or $blk.Count) {
    $why = $(if ($busy.Count) { "webcam in use by $($busy -join ';') (not touching it)" } else { 'Vision/Media process active' })
    & $L "$($r.Label) ABORTED: $why"
    if ($Sequence) { $stopped = $true }
    continue
  }
  $rm = Get-RunRoom $r
  Set-RunEnv $r.Cond $rm
  $out = Join-Path $pairDir $r.Label; $env:OUT_DIR = $out; $env:AB_GO = '1'
  & $L "$($r.Label) RUN START cond=$($r.Cond) room=$(if ($rm) { $rm } else { '(per-cond)' }) out=$out"
  $p = Start-Process -FilePath $node -ArgumentList 'ab-laptop.mjs' -WorkingDirectory $here -NoNewWindow -Wait -PassThru `
    -RedirectStandardOutput (Join-Path $pairDir "node-$($r.Label).log") -RedirectStandardError (Join-Path $pairDir "node-$($r.Label).err")
  Remove-Item env:AB_GO -ErrorAction SilentlyContinue
  $win = ''
  $tc = Join-Path $out 'conditions-timestamps.csv'
  if (Test-Path $tc) { $row = Import-Csv $tc | Select-Object -First 1; if ($row) { $win = "status=$($row.status) window=$($row.window_start_paris)->$($row.window_end_paris) rec=$($row.rec_start_paris)->$($row.rec_stop_paris)" } }
  & $L "$($r.Label) RUN STOP node exit $($p.ExitCode) $win"
  if ($Sequence -and $i -lt $runs.Count) {
    & $L "pause ${PauseSec}s"; Start-Sleep -Seconds $PauseSec
  }
}
& $L "ALL DONE $pairDir"
