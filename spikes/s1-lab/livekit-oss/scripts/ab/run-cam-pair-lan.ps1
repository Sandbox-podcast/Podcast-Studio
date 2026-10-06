# S1 laptop: matched pair ab-cam-2L-on then ab-cam-3L-on (real LifeCam, S4 rec ON via Media drop-in :3320, VP8 default,
# warmup 20 s / window 120 s / sample 2000 ms) with desktop-ai publishing take4-raw.webm as LAN pub2 in the SAME room.
# Laptop adds ab-sub-x (pinned HIGH, subscribes only to pub2) and records <cond>-sub-x-rx.webm; ab-sub-hi/lo and the
# publisher tab subscribe only to ab-pub (?subFrom), as in the 11:01 baseline.
# Before EACH condition: webcam must be free (no app currently using it per CapabilityAccessManager) and no Vision/Media
# python/runner may be active — otherwise that condition is ABORTED (never touches the user's Edge).
# -DryParse: parse-only (node AB_DRY=1), launches nothing. DO NOT RUN without lead GO.
param(
  [switch]$GoConfirmed, [switch]$DryParse,
  [string]$Conds = 'ab-cam-2L-on,ab-cam-3L-on',
  [string]$Room = ('s1-lan-pair-' + (Get-Date -Format HHmm)),
  [string]$Pub2Id = 'pub2-desktop-ai',
  [int]$IdleSec = 15,
  [string]$Lab = 'C:\Users\azero\s1-livekit-oss'
)
$ErrorActionPreference = 'Continue'
$here = $PSScriptRoot
$node = 'C:\Program Files\nodejs\node.exe'; $nvm = Join-Path $env:APPDATA 'nvm\v20.11.0'; if (Test-Path (Join-Path $nvm 'node.exe')) { $node = Join-Path $nvm 'node.exe' }
foreach ($v in 'OUT_DIR','COOLDOWN_S','SAMPLE_MS','HEADLESS','FAKE_MEDIA','CHROME_PATH','SUB_REC','UNLOCK_SUBS','CONDS','CODEC','AB_GO','AB_DRY','IDLE_S','ROOM','PUB2_ID','PUB2_WAIT_S') { Remove-Item "env:$v" -ErrorAction SilentlyContinue }
$env:CODEC = 'vp8'; $env:REC_S = '120'; $env:WARMUP_S = '20'; $env:SAMPLE_MS = '2000'; $env:IDLE_S = "$IdleSec"
$env:HARNESS = 'http://localhost:5190'; $env:AB_PATH = '/ab/index.html'; $env:S4_BASE = 'http://127.0.0.1:3320'
$env:ROOM = $Room; $env:PUB2_ID = $Pub2Id; $env:PUB2_WAIT_S = '60'
if ($DryParse) { $env:CONDS = $Conds; $env:AB_DRY = '1'; & $node (Join-Path $here 'ab-laptop.mjs'); Remove-Item env:AB_DRY -ErrorAction SilentlyContinue; return }
if (-not $GoConfirmed) { throw 'Refusing: pass -GoConfirmed only after the lead GO.' }

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
$ab = Join-Path $Lab 'public\ab'; New-Item -ItemType Directory -Force -Path $ab | Out-Null
Copy-Item (Join-Path $here 'harness.js') (Join-Path $ab 'harness.js') -Force
(Get-Content (Join-Path $here 'index.html') -Raw).Replace('src="/harness.js"', 'src="/ab/harness.js"') | Set-Content -Encoding utf8 (Join-Path $ab 'index.html')
$stamp = Get-Date -Format yyyyMMdd-HHmmss
$pairDir = Join-Path $here "pair-$stamp"; New-Item -ItemType Directory -Force -Path $pairDir | Out-Null
$plog = Join-Path $pairDir 'pair.log'
$L = { param($m) $l = "[$((Get-Date).ToString('yyyy-MM-ddTHH:mm:ss.fff'))] $m"; Write-Host $l; Add-Content -Encoding utf8 $plog $l }
& $L "pair start room=$Room pub2=$Pub2Id conds=$Conds"
foreach ($c in ($Conds -split ',')) {
  $busy = Test-CamBusy; $blk = Get-Blockers
  & $L "$c precheck cam_busy=[$($busy -join ';')] blockers=[$($blk -join ' | ')]"
  if ($busy.Count) { & $L "$c ABORTED: webcam in use by $($busy -join ';') (not touching it)"; continue }
  if ($blk.Count) { & $L "$c ABORTED: Vision/Media process active"; continue }
  $env:CONDS = $c; $env:OUT_DIR = Join-Path $pairDir $c; $env:AB_GO = '1'
  $p = Start-Process -FilePath $node -ArgumentList 'ab-laptop.mjs' -WorkingDirectory $here -NoNewWindow -Wait -PassThru `
    -RedirectStandardOutput (Join-Path $pairDir "node-$c.log") -RedirectStandardError (Join-Path $pairDir "node-$c.err")
  Remove-Item env:AB_GO -ErrorAction SilentlyContinue
  & $L "$c node exit $($p.ExitCode)"
}
& $L "pair ALL DONE $pairDir"
