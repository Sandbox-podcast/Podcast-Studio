<#
 S4 desktop-ai launcher (credential-free). Starts server-nocreds.mjs + a SEPARATE headless Edge
 (own temp profile, fake camera/mic), waits for the autorun page, then kills ONLY the PIDs it started
 and deletes the temp profile.
   .\run-s4.ps1 -Mode smoke              # <5 s, no upload (server forced into smoke mode)
   .\run-s4.ps1 -Mode record -Dur 120    # needs urls.json (from box step-b)
   add -ProxyParts to route part PUTs through the local server instead of browser->MinIO
   add -VideoFile <y4m file> / -AudioFile <wav file> to feed the fake camera/mic from files (take4 run)
 recorder.js is NOT in this folder: copy spikes/s4/dropin/public/recorder.js to .\public\recorder.js on the
 target machine, or set $env:S4_RECORDER_JS (see RUNBOOK.md). The launcher stops if the server cannot find it.
 Emergency stop: .\abort-s4.ps1
#>
param(
  [ValidateSet('smoke','record')][string]$Mode = 'smoke',
  [int]$Dur = 120,
  [int]$Port = 3340,
  [switch]$ProxyParts,
  [int]$TimeoutSec = 0,
  [string]$VideoFile = '',   # optional y4m file -> --use-file-for-fake-video-capture
  [string]$AudioFile = '',   # optional wav file -> --use-file-for-fake-audio-capture
  [string]$Label = 'synth',  # recorder session label (both 2026-10-07 runs used 'synth')
  [string]$Node = 'C:\nvm4w\nodejs\node.exe',
  [string]$Edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
)
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
# $node / $edge = the -Node / -Edge parameters (PowerShell names are case-insensitive)
$out = Join-Path $dir 'out'; New-Item -ItemType Directory -Force -Path $out | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$pidFile = Join-Path $dir 'pids.json'
if ($TimeoutSec -le 0) { $TimeoutSec = if ($Mode -eq 'smoke') { 30 } else { $Dur + 180 } }

function Log($m) { Write-Output ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss.fff'), $m) }
$srvScript = Join-Path $dir 'server-nocreds.mjs'
function OurProcs($prof) {
  # ONLY: Edge processes whose command line carries our unique temp profile path, and node running THIS work dir's server script.
  @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='node.exe'" |
    Where-Object { $_.CommandLine -and ($_.CommandLine.Contains($prof) -or $_.CommandLine.Contains($srvScript)) })
}

foreach ($f in @($VideoFile, $AudioFile)) { if ($f -and -not (Test-Path -LiteralPath $f)) { throw "media file not found: $f" } }
if (Test-Path $pidFile) { throw "pids.json exists (previous run not cleaned?) - run .\abort-s4.ps1 first" }
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) { throw "port $Port already in use" }

$urls = Join-Path $dir 'urls.json'
if ($Mode -eq 'record') {
  if (-not (Test-Path $urls)) { throw 'record mode needs urls.json (box step-b)' }
  $u = Get-Content $urls -Raw | ConvertFrom-Json
  # read the raw ISO string (ConvertFrom-Json turns it into a DateTime; re-parsing under fr-FR swaps day/month)
  $rawExp = [regex]::Match((Get-Content $urls -Raw), '"expiresAt":\s*"([^"]+)"').Groups[1].Value
  $exp = [datetimeoffset]::Parse($rawExp, [Globalization.CultureInfo]::InvariantCulture)
  $need = [datetimeoffset]::Now.AddSeconds($Dur + 300)
  if ($exp -lt $need) { throw "presigned URLs expire at $exp (< now+dur+5min); regenerate on box" }
  Log "record key=$($u.key) uploadId=$($u.uploadId.Substring(0,12))... expires=$exp"
  $env:S4_URLS = $urls
} else {
  $env:S4_URLS = Join-Path $dir '__no_urls_smoke__.json'   # guarantees smoke mode = no MinIO writes
}
$env:S4_PORT = "$Port"
$env:PROXY_PARTS = if ($ProxyParts) { '1' } else { '0' }

$edgeBefore = @(Get-Process msedge -ErrorAction SilentlyContinue).Count
$prof = Join-Path $env:TEMP "s4-edge-profile-$stamp"
$script:serverPid = $null; $edgeProc = $null
$t0 = Get-Date
try {
  $srv = Start-Process -FilePath $node -ArgumentList "`"$srvScript`"" -WorkingDirectory $dir -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $out "server-$Mode-$stamp.log") -RedirectStandardError (Join-Path $out "server-$Mode-$stamp.err")
  $script:serverPid = $srv.Id
  @{ runner = $PID; server = $srv.Id; edge = $null; profile = $prof; mode = $Mode; port = $Port; startedAt = (Get-Date -Format o) } | ConvertTo-Json | Set-Content $pidFile
  $ok = $false
  for ($i = 0; $i -lt 50; $i++) { try { $h = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 2; $ok = $true; break } catch { Start-Sleep -Milliseconds 200 } }
  if (-not $ok) { throw 'server health timeout' }
  if (-not $h.recorderJs) { throw 'server cannot find recorder.js (copy dropin/public/recorder.js to public\ or set S4_RECORDER_JS)' }
  Log "server pid=$($srv.Id) mode=$($h.mode) proxyParts=$($h.proxyParts) recorderJs=$($h.recorderJs)"

  $page = "http://localhost:$Port/autorun.html?mode=$Mode&dur=$Dur&w=1280&h=720&fps=30&vbr=2500000&label=$([uri]::EscapeDataString($Label))"
  $edgeArgs = @('--headless=new', "--user-data-dir=`"$prof`"", '--no-first-run', '--no-default-browser-check', '--disable-sync',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-features=msEdgeSidebarV2,EdgeCollections',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--use-fake-device-for-media-stream=fps=30', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required',
    '--mute-audio', '--window-size=1280,800')
  if ($VideoFile) { $edgeArgs += "--use-file-for-fake-video-capture=`"$((Resolve-Path -LiteralPath $VideoFile).Path)`"" }
  if ($AudioFile) { $edgeArgs += "--use-file-for-fake-audio-capture=`"$((Resolve-Path -LiteralPath $AudioFile).Path)`"" }
  $edgeArgs += $page
  Log ("fake media: video={0} audio={1}" -f ($(if ($VideoFile) { $VideoFile } else { 'chromium-pattern' })), ($(if ($AudioFile) { $AudioFile } else { 'chromium-beep' })))
  $edgeProc = Start-Process -FilePath $edge -ArgumentList $edgeArgs -PassThru -WindowStyle Hidden
  @{ runner = $PID; server = $srv.Id; edge = $edgeProc.Id; profile = $prof; mode = $Mode; port = $Port; startedAt = (Get-Date -Format o) } | ConvertTo-Json | Set-Content $pidFile
  Log "edge pid=$($edgeProc.Id) profile=$prof"
  Log "page $page"

  $deadline = (Get-Date).AddSeconds($TimeoutSec); $lastMsg = ''
  $st = $null
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    try { $st = Invoke-RestMethod "http://127.0.0.1:$Port/api/autorun/state" -TimeoutSec 3 } catch { continue }
    if ($st.autorun.lastLog -and $st.autorun.lastLog.t -ne $lastMsg) {
      $lastMsg = $st.autorun.lastLog.t
      Log ("page: {0} {1}" -f $st.autorun.lastLog.msg, ($st.autorun.lastLog.data | ConvertTo-Json -Compress -Depth 5))
    }
    if ($st.autorun.done) { break }
  }
  if (-not $st -or -not $st.autorun.done) { Log "TIMEOUT after $TimeoutSec s (autorun not done)" }
  else { Log ("done ok={0} elapsed={1:N1}s" -f $st.autorun.summary.ok, ((Get-Date) - $t0).TotalSeconds) }
}
finally {
  $victims = OurProcs $prof
  foreach ($p in $victims) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {} }
  if ($edgeProc) { try { Stop-Process -Id $edgeProc.Id -Force -ErrorAction SilentlyContinue } catch {} }
  if ($script:serverPid) { try { Stop-Process -Id $script:serverPid -Force -ErrorAction SilentlyContinue } catch {} }
  Start-Sleep -Milliseconds 800
  for ($i = 0; $i -lt 10 -and (Test-Path $prof); $i++) { try { Remove-Item -Recurse -Force $prof -ErrorAction Stop } catch { Start-Sleep -Milliseconds 500 } }
  $left = OurProcs $prof
  $edgeAfter = @(Get-Process msedge -ErrorAction SilentlyContinue).Count
  Log ("cleanup: killed={0} remaining_ours={1} profile_exists={2} msedge_total before={3} after={4}" -f $victims.Count, $left.Count, (Test-Path $prof), $edgeBefore, $edgeAfter)
  if ($left.Count -eq 0 -and -not (Test-Path $prof)) { Remove-Item $pidFile -ErrorAction SilentlyContinue }
  Remove-Item Env:S4_URLS, Env:S4_PORT, Env:PROXY_PARTS -ErrorAction SilentlyContinue
}
$sum = Join-Path $out "autorun-$Mode.json"
if (Test-Path $sum) { Get-Content $sum -Raw }
