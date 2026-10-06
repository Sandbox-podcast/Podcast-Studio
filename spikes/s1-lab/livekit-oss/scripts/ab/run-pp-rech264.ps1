# S1 laptop: ab-file-2L-on-pp with the S4 HQ rec FORCED to H.264 (Media drop-in v2.2, :3320).
# Same as the 04:00 ab-file-2L-on-pp run (VP8 2L live publish, take4 ping-pong source, warmup 20 s, window 120 s,
# rec ON) except the rec call: __s4.startSession({label:'raw', participant:'ab-file-2L-on-pp-h264',
# mimeType:'video/webm;codecs=h264', vBitrate:2500000, timeslice:1000}) on the published stream.
# Aborts the condition (FAIL, explicit error) if results.recorderMimeType has no h264/avc1.
# Pre-run idle CPU sample (IDLE_S=15, before any Edge launch) -> preflight.idleCpu in ab-summary.json.
# DO NOT RUN without lead GO. Test Edge instances only (file source); never the user's Edge or the webcam.
param([switch]$GoConfirmed, [switch]$DryParse, [int]$IdleSec = 15, [string]$Lab = 'C:\Users\azero\s1-livekit-oss')
$ErrorActionPreference = 'Continue'
$here = $PSScriptRoot
$node = 'C:\Program Files\nodejs\node.exe'; $nvm = Join-Path $env:APPDATA 'nvm\v20.11.0'; if (Test-Path (Join-Path $nvm 'node.exe')) { $node = Join-Path $nvm 'node.exe' }
foreach ($v in 'OUT_DIR','COOLDOWN_S','SAMPLE_MS','HEADLESS','FAKE_MEDIA','CHROME_PATH','SUB_REC','UNLOCK_SUBS','CONDS','CODEC','AB_GO','AB_DRY','IDLE_S','WIN_S','N_PUB','LAYERS','SRC') { Remove-Item "env:$v" -ErrorAction SilentlyContinue }
$env:CONDS = 'ab-file-2L-on-pp-rech264'; $env:CODEC = 'vp8'; $env:REC_S = '120'; $env:WARMUP_S = '20'; $env:IDLE_S = "$IdleSec"
$env:HARNESS = 'http://localhost:5190'; $env:AB_PATH = '/ab/index.html'; $env:S4_BASE = 'http://127.0.0.1:3320'
if ($DryParse) {
  # parse-only: prints the planned condition + rec call and exits; no preflight, no Edge, no LiveKit, no deploy
  $env:AB_DRY = '1'; & $node (Join-Path $here 'ab-laptop.mjs'); Remove-Item env:AB_DRY -ErrorAction SilentlyContinue; return
}
if (-not $GoConfirmed) { throw 'Refusing: pass -GoConfirmed only after the lead GO.' }
$ab = Join-Path $Lab 'public\ab'; New-Item -ItemType Directory -Force -Path $ab | Out-Null
Copy-Item (Join-Path $here 'harness.js') (Join-Path $ab 'harness.js') -Force
(Get-Content (Join-Path $here 'index.html') -Raw).Replace('src="/harness.js"', 'src="/ab/harness.js"') | Set-Content -Encoding utf8 (Join-Path $ab 'index.html')
$env:AB_GO = '1'
$stamp = Get-Date -Format yyyyMMdd-HHmmss
Write-Host "[run] pp-rech264 start $(Get-Date -Format HH:mm:ss)"
$p = Start-Process -FilePath $node -ArgumentList 'ab-laptop.mjs' -WorkingDirectory $here -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$here\node-pprech264-$stamp.log" -RedirectStandardError "$here\node-pprech264-$stamp.err"
Write-Host "[run] pp-rech264 exit $($p.ExitCode) $(Get-Date -Format HH:mm:ss)"
Remove-Item env:AB_GO -ErrorAction SilentlyContinue
Write-Host "[run] ALL DONE $(Get-Date -Format HH:mm:ss)"
