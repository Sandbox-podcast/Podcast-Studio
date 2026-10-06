# S1 laptop: (1) régie decode floor (5 pubs 2L VP8 + 1 régie sub HIGH) then (2) ping-pong rerun ab-file-2L-off-pp / -on-pp.
# DO NOT RUN without lead GO. Never touches the user's own Edge or the webcam (test Edge instances only; file sources).
param([switch]$GoConfirmed, [switch]$SkipRegie, [switch]$SkipPP, [string]$Lab = 'C:\Users\azero\s1-livekit-oss')
$ErrorActionPreference = 'Continue'
if (-not $GoConfirmed) { throw 'Refusing: pass -GoConfirmed only after GO.' }
$here = $PSScriptRoot
$node = 'C:\Program Files\nodejs\node.exe'; $nvm = Join-Path $env:APPDATA 'nvm\v20.11.0'; if (Test-Path (Join-Path $nvm 'node.exe')) { $node = Join-Path $nvm 'node.exe' }
$ab = Join-Path $Lab 'public\ab'; New-Item -ItemType Directory -Force -Path $ab | Out-Null
Copy-Item (Join-Path $here 'harness.js') (Join-Path $ab 'harness.js') -Force
(Get-Content (Join-Path $here 'index.html') -Raw).Replace('src="/harness.js"', 'src="/ab/harness.js"') | Set-Content -Encoding utf8 (Join-Path $ab 'index.html')
foreach ($v in 'OUT_DIR','COOLDOWN_S','SAMPLE_MS','HEADLESS','FAKE_MEDIA','CHROME_PATH','SUB_REC','UNLOCK_SUBS','CONDS','CODEC') { Remove-Item "env:$v" -ErrorAction SilentlyContinue }
$env:AB_GO = '1'; $env:HARNESS = 'http://localhost:5190'; $env:AB_PATH = '/ab/index.html'; $env:S4_BASE = 'http://127.0.0.1:3320'; $env:WARMUP_S = '20'
$stamp = Get-Date -Format yyyyMMdd-HHmmss
if (-not $SkipRegie) {
  $env:WIN_S = '120'; $env:N_PUB = '5'; $env:LAYERS = '2'; $env:SRC = 'take4-pingpong.webm'
  Write-Host "[run] regie start $(Get-Date -Format HH:mm:ss)"
  $p = Start-Process -FilePath $node -ArgumentList 'regie-laptop.mjs' -WorkingDirectory $here -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$here\node-regie-$stamp.log" -RedirectStandardError "$here\node-regie-$stamp.err"
  Write-Host "[run] regie exit $($p.ExitCode) $(Get-Date -Format HH:mm:ss)"
  Start-Sleep -Seconds 10
}
if (-not $SkipPP) {
  $env:CONDS = 'ab-file-2L-off-pp,ab-file-2L-on-pp'; $env:REC_S = '120'; $env:CODEC = 'vp8'
  Write-Host "[run] pp start $(Get-Date -Format HH:mm:ss)"
  $p = Start-Process -FilePath $node -ArgumentList 'ab-laptop.mjs' -WorkingDirectory $here -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$here\node-pp-$stamp.log" -RedirectStandardError "$here\node-pp-$stamp.err"
  Write-Host "[run] pp exit $($p.ExitCode) $(Get-Date -Format HH:mm:ss)"
}
Write-Host "[run] ALL DONE $(Get-Date -Format HH:mm:ss)"
