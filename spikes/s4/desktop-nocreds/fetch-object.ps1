# Phase-2 post-run (desktop-ai): HEAD + GET the completed object and results.json via presigned URLs -> out\ ; sha256 vs page.
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot; $out = Join-Path $dir 'out'
$u = Get-Content (Join-Path $dir 'urls.json') -Raw | ConvertFrom-Json
$name = ($u.key -split '/')[-1]
$h = Invoke-WebRequest -Uri $u.head -Method Head -UseBasicParsing
"HEAD $($u.key) -> $($h.StatusCode) len=$($h.Headers['Content-Length']) etag=$($h.Headers['ETag'])"
$dst = Join-Path $out $name
$sw = [Diagnostics.Stopwatch]::StartNew()
Invoke-WebRequest -Uri $u.get -OutFile $dst -UseBasicParsing
$sw.Stop()
$sha = (Get-FileHash -Algorithm SHA256 $dst).Hash.ToLower()
"GET -> $dst size=$((Get-Item $dst).Length) ms=$($sw.ElapsedMilliseconds) sha256=$sha"
$rj = Join-Path $out ([IO.Path]::ChangeExtension($name, '.results.bucket.json'))
try { Invoke-WebRequest -Uri $u.resultsGet -OutFile $rj -UseBasicParsing; "results.json from bucket -> $rj" } catch { "results GET failed: $_" }
$a = Join-Path $out 'autorun-record.json'
if (Test-Path $a) { $s = Get-Content $a -Raw | ConvertFrom-Json; "page localSha256=$($s.localSha256) localBytes=$($s.localBytes) match=$($s.localSha256 -eq $sha)" }
