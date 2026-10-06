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
$env:Path = "C:\Program Files\nodejs;$env:Path"
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
if (-not (Test-Path 'node_modules\playwright-core')) { npm init -y | Out-Null; npm install playwright-core@1.48.2 --silent }
# 4) run
$env:AB_GO = '1'; $env:CONDS = $Conds; $env:REC_S = "$RecSec"; $env:WARMUP_S = "$WarmupSec"; $env:S4_BASE = $S4Base
$env:HARNESS = 'http://localhost:5190'; $env:AB_PATH = '/ab/index.html'
node .\ab-laptop.mjs
Pop-Location
