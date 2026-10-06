# Wrapper v2: S4 H.264 MediaRecorder probe on the laptop (own Edge via Playwright temp profile, synthetic media only).
# Usage (from any folder):
#   powershell -NoProfile -ExecutionPolicy Bypass -File <dir>\run-probe.ps1 [-Only h264] [-Secs 60] [-Both | -Headed]
#              [-IdleSecs 10] [-AllH264] [-PlaywrightDir <...\node_modules\playwright-core>]
#   -Both   : runs headless first, then headed (window off-screen at -2400,-2400) — two run folders.
param([string]$PlaywrightDir = '', [int]$Secs = 15, [int]$Vbps = 2500000, [switch]$Headed, [switch]$Both,
      [switch]$AllH264, [string]$Only = '', [int]$IdleSecs = 10,
      [string]$Out = 'C:\Users\azero\podcast-studio\s4-h264-probe')
$ErrorActionPreference = 'Stop'
$nvm = 'C:\Users\azero\AppData\Roaming\nvm\v20.11.0'
if (Test-Path "$nvm\node.exe") { $env:Path = "$nvm;" + $env:Path }
node -v | Out-Host

# 1) locate an existing playwright-core (RTC repo) — shallow search only, AppData excluded
if (-not $PlaywrightDir) {
  $roots = @('C:\Users\azero\podcast-studio', 'C:\Users\azero\source', 'C:\Users\azero\repos', 'C:\Users\azero\dev', 'C:\Users\azero\code', 'C:\Users\azero')
  foreach ($r in $roots) {
    if (-not (Test-Path $r)) { continue }
    $hit = Get-ChildItem -Path $r -Directory -Depth 3 -Filter 'playwright-core' -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match '\\node_modules\\playwright-core$' -and $_.FullName -notmatch '\\AppData\\' } |
      Select-Object -First 1
    if ($hit) { $PlaywrightDir = $hit.FullName; break }
  }
}
# 2) fallback: temp install (no browser download; uses installed Edge via channel msedge)
if (-not $PlaywrightDir) {
  $tmp = Join-Path $env:TEMP 's4-h264-pw'
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  Push-Location $tmp
  $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
  npm init -y | Out-Null; npm install --no-audit --no-fund playwright-core | Out-Host
  Pop-Location
  $PlaywrightDir = Join-Path $tmp 'node_modules\playwright-core'
}
"playwright-core: $PlaywrightDir" | Out-Host
New-Item -ItemType Directory -Force -Path $Out | Out-Null

$modes = @()
if ($Both) { $modes = @($false, $true) } else { $modes = @([bool]$Headed) }
$rc = 0
foreach ($h in $modes) {
  $label = if ($h) { 'headed' } else { 'headless' }
  "=== run: $label ===" | Out-Host
  $nodeArgs = @("$PSScriptRoot\probe.mjs", '--pw', $PlaywrightDir, '--out', $Out, '--channel', 'msedge',
                '--secs', "$Secs", '--vbps', "$Vbps", '--idle-secs', "$IdleSecs", '--label', $label)
  if ($h) { $nodeArgs += '--headed' }
  if ($AllH264) { $nodeArgs += '--all-h264' }
  if ($Only) { $nodeArgs += @('--only', $Only) }
  & node @nodeArgs
  if ($LASTEXITCODE -ne 0) { $rc = $LASTEXITCODE; "run $label failed rc=$rc" | Out-Host }
}
exit $rc
