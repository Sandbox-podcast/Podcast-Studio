# S1 laptop A/B wrapper. DO NOT RUN until the lead confirms Vision freed the 3070.
# Stage this folder at C:\Users\azero\s1-livekit-oss\scripts\ab\ together with harness.js + index.html
# from spikes/s1-lab/livekit-oss/public/. Deploys them to public\ab\ (root harness untouched).
param(
  [switch]$VisionFreeConfirmed,
  [string]$Conds = 'default',      # default = file-3L-off,file-3L-on,file-2L-off,file-2L-on,cam-3L-on | 'full8' | comma list
  [int]$RecSec = 120,
  [int]$WarmupSec = 20,
  [string]$S4Base = 'http://127.0.0.1:3320',
  [string]$Lab = 'C:\Users\azero\s1-livekit-oss'
)
$ErrorActionPreference = 'Stop'
if (-not $VisionFreeConfirmed) { throw 'Refusing: pass -VisionFreeConfirmed only after the lead says Vision freed the 3070.' }
$here = $PSScriptRoot
# npm.ps1 on this laptop fails (nvm symlink -> EPERM in npm-prefix.js); call node + npm-cli.js directly.
$node = 'C:\Program Files\nodejs\node.exe'
$npmCli = 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'
$nvm = Join-Path $env:APPDATA 'nvm\v20.11.0'
if (Test-Path (Join-Path $nvm 'node.exe')) { $node = Join-Path $nvm 'node.exe'; $npmCli = Join-Path $nvm 'node_modules\npm\bin\npm-cli.js' }
# 1) deploy A/B harness to /ab/ (index.html script path rewritten)
$ab = Join-Path $Lab 'public\ab'
New-Item -ItemType Directory -Force -Path $ab | Out-Null
Copy-Item (Join-Path $here 'harness.js') (Join-Path $ab 'harness.js') -Force
(Get-Content (Join-Path $here 'index.html') -Raw).Replace('src="/harness.js"', 'src="/ab/harness.js"') | Set-Content -Encoding utf8 (Join-Path $ab 'index.html')
# 2) preflight (read-only): harness, LiveKit, S4 health — never restart Media's process
foreach ($u in @('http://localhost:5190/ab/index.html', "$S4Base/api/health")) {
  try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 $u; Write-Host "[pre] $u -> $($r.StatusCode)" } catch { Write-Host "[pre] $u -> FAIL $($_.Exception.Message)" }
}
# 3) deps (local to this folder)
Push-Location $here
if (-not (Test-Path 'node_modules\playwright-core')) {
  if (-not (Test-Path 'package.json')) { '{"name":"s1-ab","private":true}' | Set-Content -Encoding ascii package.json }
  $env:npm_config_cache = Join-Path $here '.npm-cache'
  & $node $npmCli install playwright-core@1.48.2 --no-audit --no-fund
}
# 4) run
# PS 5.1 + $ErrorActionPreference=Stop turns ANY native stderr line into a terminating error that kills
# node mid-run (happened twice at end of cond 1). Run node with its own stdout/stderr files and Continue.
$ErrorActionPreference = 'Continue'
foreach ($v in 'OUT_DIR','COOLDOWN_S','SAMPLE_MS','HEADLESS','FAKE_MEDIA','CHROME_PATH','SUB_REC','UNLOCK_SUBS') { Remove-Item "env:$v" -ErrorAction SilentlyContinue }
$env:AB_GO = '1'; $env:CONDS = $Conds; $env:REC_S = "$RecSec"; $env:WARMUP_S = "$WarmupSec"; $env:S4_BASE = $S4Base
$env:HARNESS = 'http://localhost:5190'; $env:AB_PATH = '/ab/index.html'
$nodeOut = Join-Path $here ("node-" + (Get-Date -Format yyyyMMdd-HHmmss) + ".log")
$np = Start-Process -FilePath $node -ArgumentList 'ab-laptop.mjs' -WorkingDirectory $here -NoNewWindow -Wait -PassThru -RedirectStandardOutput $nodeOut -RedirectStandardError ($nodeOut + '.err')
Write-Host "node exit $($np.ExitCode) (log $nodeOut)"
Pop-Location
