# S1 LAN 2nd publisher on desktop-ai (no webcam): publishes the take4-raw.webm file loop (2 simulcast layers, VP8
# default) into the laptop LiveKit (ws://192.168.1.68:7880) with a PRE-MINTED token (www\token.json, minted on the
# laptop by scripts\mint-token.mjs — desktop-ai cannot reach the laptop :5190 token endpoint, and needs no new rule).
# Starts: node pub2-server.mjs (127.0.0.1 only) + ab-cpu-sampler.ps1 (marker = temp user-data-dir) + a HEADED test Edge
# with its own temp --user-data-dir (never the user's Edge profile). Stays in the foreground until <Root>\STOP exists
# or -MaxMin elapses, then kills ONLY the processes it started (marker match) and deletes the temp profile.
# No install, no firewall change. DO NOT RUN without lead GO.
param(
  [switch]$Go,
  [string]$Root = "$env:USERPROFILE\s1-pub2",
  [int]$Port = 5191,
  [int]$Layers = 2,
  [string]$Codec = 'vp8',
  [string]$Src = 'take4-raw.webm',
  [int]$SampleMs = 2000,
  [int]$MaxMin = 20
)
$ErrorActionPreference = 'Continue'
if (-not $Go) { throw 'Refusing: pass -Go only after the lead GO.' }
$paris = { (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss.fff') }
$stamp = Get-Date -Format yyyyMMdd-HHmmss
$out = Join-Path $Root "out\run-$stamp"; New-Item -ItemType Directory -Force -Path $out | Out-Null
Remove-Item (Join-Path $Root 'STOP') -ErrorAction SilentlyContinue
$log = { param($m) $l = "[$(& $paris)] $m"; Write-Host $l; Add-Content -Encoding utf8 (Join-Path $out 'launch.log') $l }
if (-not (Test-Path (Join-Path $Root 'www\token.json'))) { & $log 'ABORT www\token.json missing (mint it on the laptop first)'; exit 3 }
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { & $log 'ABORT node not found'; exit 3 }
$env:PORT = "$Port"; $env:OUT_DIR = $out
$srv = Start-Process -FilePath $node -ArgumentList "`"$(Join-Path $Root 'pub2-server.mjs')`"" -WorkingDirectory $Root -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $out 'server.log') -RedirectStandardError (Join-Path $out 'server.err')
Start-Sleep -Seconds 1
try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://localhost:$Port/index.html"; & $log "server pid $($srv.Id) -> $($r.StatusCode)" } catch { & $log "server FAIL $($_.Exception.Message)"; Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue; exit 4 }
$marker = "s1pub2-$stamp"; $udd = Join-Path $env:TEMP $marker
$cpu = Start-Process -FilePath powershell.exe -WindowStyle Hidden -PassThru -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$(Join-Path $Root 'ab-cpu-sampler.ps1')`"",'-Markers',$marker,'-OutCsv',"`"$(Join-Path $out 'pub2-cpu.csv')`"",'-IntervalMs',"$SampleMs",'-DurationSec',"$($MaxMin*60)")
$edgeExe = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$url = "http://localhost:$Port/index.html?mode=file&layers=$Layers&src=$Src&tokenFile=/token.json&autojoin=1&unlockStats=1&subFrom=__none__&cond=pub2-desktop-ai&sampleMs=$SampleMs"
if ($Codec -ne 'vp8') { $url += "&codec=$Codec" }
# --use-fake-device-for-media-stream only feeds the DISABLED, unpublished unlockStats mic (exposes encoderImplementation);
# the published video is the file captureStream.
$edgeArgs = @("--user-data-dir=`"$udd`"",'--no-first-run','--no-default-browser-check','--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
  '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--new-window',"`"$url`"")
$edge = Start-Process -FilePath $edgeExe -ArgumentList $edgeArgs -PassThru
@{ stamp = $stamp; marker = $marker; userDataDir = $udd; out = $out; serverPid = $srv.Id; cpuPid = $cpu.Id; edgePid = $edge.Id; url = $url; started = (& $paris) } |
  ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $Root 'current.json')
& $log "edge pid $($edge.Id) marker $marker url $url"
$deadline = (Get-Date).AddMinutes($MaxMin)
while (-not (Test-Path (Join-Path $Root 'STOP')) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2 }
& $log ("stop requested: " + $(if (Test-Path (Join-Path $Root 'STOP')) { 'STOP file' } else { "MaxMin $MaxMin" }))
# cleanup: only processes carrying the marker / started here
$mine = Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*$marker*" }
foreach ($p in $mine) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
foreach ($id in @($cpu.Id, $srv.Id)) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
$left = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$marker*" -or $_.ProcessId -in @($cpu.Id, $srv.Id) })
Remove-Item -Recurse -Force $udd -ErrorAction SilentlyContinue
Remove-Item (Join-Path $Root 'STOP') -ErrorAction SilentlyContinue
& $log "cleanup done: killed $($mine.Count) edge procs; leftover=$($left.Count); temp profile removed=$(-not (Test-Path $udd))"
