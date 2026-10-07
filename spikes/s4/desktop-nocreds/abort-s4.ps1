<# EMERGENCY STOP (Loic takes the machine back): kill ONLY our server + test Edge, delete temp profile,
   and abort the multipart upload via the presigned abort URL (no creds needed).
   .\abort-s4.ps1             # kill + abort upload
   .\abort-s4.ps1 -KeepUpload # kill only (upload stays resumable until URLs expire / stale-upload expiry)
#>
param([switch]$KeepUpload)
$dir = $PSScriptRoot
$pidFile = Join-Path $dir 'pids.json'
$info = if (Test-Path $pidFile) { Get-Content $pidFile -Raw | ConvertFrom-Json } else { $null }
$srvScript = Join-Path $dir 'server-nocreds.mjs'
$victims = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='node.exe'" | Where-Object {
  $_.CommandLine -and ( $_.CommandLine -match 's4-edge-profile-\d{8}-\d{6}' -or $_.CommandLine.Contains($srvScript) -or
    ($info -and ($_.ProcessId -eq $info.server -or $_.ProcessId -eq $info.edge) -and $_.CommandLine -match 's4-edge-profile-|server-nocreds\.mjs') ) })
if ($info -and $info.runner) {  # standalone launcher pwsh (only if its command line is run-s4.ps1; never an agent/user shell)
  $victims += @(Get-CimInstance Win32_Process -Filter "ProcessId=$($info.runner)" | Where-Object { $_.CommandLine -match 'run-s4\.ps1' })
}
foreach ($p in $victims) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {} }
"killed $($victims.Count) process(es): " + (($victims | ForEach-Object { "$($_.Name):$($_.ProcessId)" }) -join ' ')
Start-Sleep -Milliseconds 800
Get-ChildItem $env:TEMP -Directory -Filter 's4-edge-profile-*' -ErrorAction SilentlyContinue | ForEach-Object {
  for ($i = 0; $i -lt 10 -and (Test-Path $_.FullName); $i++) { try { Remove-Item -Recurse -Force $_.FullName -ErrorAction Stop } catch { Start-Sleep -Milliseconds 500 } }
  "profile $($_.Name) removed=$(-not (Test-Path $_.FullName))"
}
$urls = Join-Path $dir 'urls.json'
if (-not $KeepUpload -and (Test-Path $urls)) {
  $u = Get-Content $urls -Raw | ConvertFrom-Json
  try { $r = Invoke-WebRequest -Uri $u.abort -Method Delete -UseBasicParsing -TimeoutSec 10 -SkipHttpErrorCheck; "abort multipart $($u.key) -> HTTP $($r.StatusCode)" }
  catch { "abort failed: $_" }
  try { $r = Invoke-WebRequest -Uri $u.list -UseBasicParsing -TimeoutSec 10 -SkipHttpErrorCheck; "list-parts after abort -> HTTP $($r.StatusCode) (404 NoSuchUpload = aborted)" } catch { "list after abort: $_" }
}
$left = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='node.exe'" | Where-Object { $_.CommandLine -match 's4-edge-profile-\d{8}-\d{6}' -or ($_.CommandLine -and $_.CommandLine.Contains($srvScript)) })
"remaining ours: $($left.Count)"
if ($left.Count -eq 0) { Remove-Item $pidFile -ErrorAction SilentlyContinue }
