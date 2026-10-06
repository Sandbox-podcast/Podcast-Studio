# S4 LAN test step 2 (desktop-ai, PowerShell 7): multipart uploads via presigned URLs,
# per-part timing, resume after a simulated cut, HEAD + GET-back sha256 verification.
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:TEMP 's4-lan-test'; Set-Location $dir
$urls = Get-Content (Join-Path $dir 'urls.json') -Raw | ConvertFrom-Json
$plan = Get-Content (Join-Path $dir 'plan.json') -Raw | ConvertFrom-Json
$PART = 5MB
$log = [System.Collections.Generic.List[object]]::new()
function Now { (Get-Date).ToString('HH:mm:ss.fff') }
function Read-Part($file, [int]$n) {
  $fs = [System.IO.File]::OpenRead($file)
  try {
    $off = [int64]($n-1) * $PART; $len = [int][math]::Min($PART, $fs.Length - $off)
    $buf = New-Object byte[] $len; $fs.Seek($off,'Begin') | Out-Null
    $r = 0; while ($r -lt $len) { $r += $fs.Read($buf, $r, $len-$r) }
    return ,$buf
  } finally { $fs.Close() }
}
function Put-Part($client, $url, [byte[]]$buf, $ct = [System.Threading.CancellationToken]::None) {
  $content = [System.Net.Http.ByteArrayContent]::new($buf)
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $resp = $client.PutAsync($url, $content, $ct).GetAwaiter().GetResult()
  $sw.Stop()
  if (-not $resp.IsSuccessStatusCode) { throw "PUT part failed $([int]$resp.StatusCode): $($resp.Content.ReadAsStringAsync().Result)" }
  return @{ etag = $resp.Headers.ETag.Tag; ms = $sw.Elapsed.TotalMilliseconds; bytes = $buf.Length }
}
function Complete-Upload($client, $url, $parts) {
  $sb = [System.Text.StringBuilder]::new('<CompleteMultipartUpload>')
  foreach ($p in ($parts | Sort-Object { [int]$_.n })) { [void]$sb.Append("<Part><PartNumber>$($p.n)</PartNumber><ETag>$($p.etag)</ETag></Part>") }
  [void]$sb.Append('</CompleteMultipartUpload>')
  $content = [System.Net.Http.StringContent]::new($sb.ToString(), [System.Text.Encoding]::UTF8, 'application/xml')
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $resp = $client.PostAsync($url, $content).GetAwaiter().GetResult(); $sw.Stop()
  $body = $resp.Content.ReadAsStringAsync().Result
  if (-not $resp.IsSuccessStatusCode -or $body -match '<Error>') { throw "Complete failed $([int]$resp.StatusCode): $body" }
  return @{ ms = $sw.Elapsed.TotalMilliseconds; etag = ([xml]$body).CompleteMultipartUploadResult.ETag }
}
function List-Parts($client, $url) {
  $resp = $client.GetAsync($url).GetAwaiter().GetResult()
  $body = $resp.Content.ReadAsStringAsync().Result
  if (-not $resp.IsSuccessStatusCode) { throw "ListParts failed $([int]$resp.StatusCode): $body" }
  $x = [xml]$body
  return @($x.ListPartsResult.Part | Where-Object { $_ } | ForEach-Object { @{ n = [int]$_.PartNumber; etag = $_.ETag; size = [int64]$_.Size } })
}
function Expected-ETag($file, [int]$nparts) {
  $md5 = [System.Security.Cryptography.MD5]::Create(); $cat = [System.IO.MemoryStream]::new()
  for ($i=1; $i -le $nparts; $i++) { $h = $md5.ComputeHash((Read-Part $file $i)); $cat.Write($h,0,$h.Length) }
  return '"' + ([BitConverter]::ToString($md5.ComputeHash($cat.ToArray())) -replace '-','').ToLower() + "-$nparts" + '"'
}
$results = [ordered]@{ host = $env:COMPUTERNAME; started = (Get-Date -Format o) }

# ---------- A and B: sequential full uploads ----------
foreach ($L in 'A','B') {
  $client = [System.Net.Http.HttpClient]::new(); $p = $plan.$L; $u = $urls.$L; $parts = @()
  $t0 = Get-Date; $sw = [System.Diagnostics.Stopwatch]::StartNew()
  for ($i=1; $i -le [int]$p.parts; $i++) {
    $buf = Read-Part $p.file $i
    $r = Put-Part $client $u.parts."$i" $buf
    $parts += @{ n=$i; etag=$r.etag; ms=[math]::Round($r.ms,1); bytes=$r.bytes }
  }
  $c = Complete-Upload $client $u.complete $parts; $sw.Stop()
  $results[$L] = [ordered]@{ mode='sequential'; start=$t0.ToString('HH:mm:ss.fff'); end=(Now); total_ms=[math]::Round($sw.Elapsed.TotalMilliseconds,1); complete_ms=[math]::Round($c.ms,1); etag=$c.etag; parts=$parts }
  $client.Dispose()
}

# ---------- D: 4 parts in flight ----------
$client = [System.Net.Http.HttpClient]::new(); $p = $plan.D; $u = $urls.D
$inflight = @{}; $done = @(); $next = 1; $N = [int]$p.parts
$t0 = Get-Date; $sw = [System.Diagnostics.Stopwatch]::StartNew()
while ($done.Count -lt $N) {
  while ($inflight.Count -lt 4 -and $next -le $N) {
    $buf = Read-Part $p.file $next
    $task = $client.PutAsync($u.parts."$next", [System.Net.Http.ByteArrayContent]::new($buf))
    $inflight[$next] = @{ task=$task; sw=[System.Diagnostics.Stopwatch]::StartNew(); bytes=$buf.Length }; $next++
  }
  $keys = @($inflight.Keys); $tasks = [System.Threading.Tasks.Task[]]@($keys | ForEach-Object { $inflight[$_].task })
  $idx = [System.Threading.Tasks.Task]::WaitAny($tasks); $k = $keys[$idx]; $e = $inflight[$k]; $e.sw.Stop()
  $resp = $e.task.Result; if (-not $resp.IsSuccessStatusCode) { throw "D part $k failed $([int]$resp.StatusCode)" }
  $done += @{ n=$k; etag=$resp.Headers.ETag.Tag; ms=[math]::Round($e.sw.Elapsed.TotalMilliseconds,1); bytes=$e.bytes }
  $inflight.Remove($k)
}
$c = Complete-Upload $client $u.complete $done; $sw.Stop()
$results['D'] = [ordered]@{ mode='parallel-4'; start=$t0.ToString('HH:mm:ss.fff'); end=(Now); total_ms=[math]::Round($sw.Elapsed.TotalMilliseconds,1); complete_ms=[math]::Round($c.ms,1); etag=$c.etag; parts=$done }
$client.Dispose()

# ---------- C: resume test ----------
$p = $plan.C; $u = $urls.C; $N = [int]$p.parts; $sent1 = @(); $sent2 = @()
$client1 = [System.Net.Http.HttpClient]::new()
$tA = Get-Date
for ($i=1; $i -le 6; $i++) { $r = Put-Part $client1 $u.parts."$i" (Read-Part $p.file $i); $sent1 += @{ n=$i; ms=[math]::Round($r.ms,1); result='ok' } }
# part 7: cut mid-flight (cancel after 30 ms, then drop the client = tab/network cut)
$cts = [System.Threading.CancellationTokenSource]::new(); $cts.CancelAfter(30)
$cut = 'unknown'
try { $r = Put-Part $client1 $u.parts.'7' (Read-Part $p.file 7) $cts.Token; $cut = 'part7-completed-before-cancel'; $sent1 += @{ n=7; ms=[math]::Round($r.ms,1); result='ok' } }
catch { $cut = 'part7-cancelled-mid-transfer'; $sent1 += @{ n=7; result='cancelled' } }
$client1.Dispose(); $tCut = Get-Date
Start-Sleep -Seconds 5
# restart: fresh client, ListParts, upload only missing
$tR = Get-Date; $sw = [System.Diagnostics.Stopwatch]::StartNew()
$client2 = [System.Net.Http.HttpClient]::new()
$swL = [System.Diagnostics.Stopwatch]::StartNew(); $present = List-Parts $client2 $u.list; $swL.Stop()
$have = @($present | ForEach-Object { $_.n })
$missing = @(1..$N | Where-Object { $have -notcontains $_ })
$all = @($present | ForEach-Object { @{ n=$_.n; etag=$_.etag } })
foreach ($i in $missing) { $r = Put-Part $client2 $u.parts."$i" (Read-Part $p.file $i); $sent2 += @{ n=$i; ms=[math]::Round($r.ms,1) }; $all += @{ n=$i; etag=$r.etag } }
$c = Complete-Upload $client2 $u.complete $all; $sw.Stop(); $client2.Dispose()
$resent = @($sent2 | Where-Object { $have -contains $_.n } | ForEach-Object { $_.n })
$results['C'] = [ordered]@{ mode='resume'; phase1_start=$tA.ToString('HH:mm:ss.fff'); cut_at=$tCut.ToString('HH:mm:ss.fff'); cut=$cut; phase1_sent=$sent1;
  restart_at=$tR.ToString('HH:mm:ss.fff'); listparts_ms=[math]::Round($swL.Elapsed.TotalMilliseconds,1); parts_present_after_cut=$have; present_sizes=@($present|ForEach-Object{$_.size});
  missing_uploaded=$missing; phase2_sent=$sent2; resent_parts_already_present=$resent; restart_to_complete_ms=[math]::Round($sw.Elapsed.TotalMilliseconds,1); complete_ms=[math]::Round($c.ms,1); etag=$c.etag; end=(Now) }

# ---------- integrity: HEAD + GET back + sha256 ----------
$client = [System.Net.Http.HttpClient]::new(); $client.Timeout = [TimeSpan]::FromMinutes(5)
$integ = [ordered]@{}
foreach ($L in 'A','B','C','D') {
  $p = $plan.$L; $u = $urls.$L
  $hreq = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Head, $u.head)
  $h = $client.SendAsync($hreq).GetAwaiter().GetResult()
  $headLen = $h.Content.Headers.ContentLength; $headEtag = $h.Headers.ETag.Tag
  $dl = Join-Path $dir "download-$L.bin"
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $g = $client.GetAsync($u.get, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
  $fs = [System.IO.File]::Create($dl); try { $g.Content.ReadAsStream().CopyTo($fs) } finally { $fs.Close() }; $sw.Stop()
  $dlSha = (Get-FileHash -Algorithm SHA256 $dl).Hash.ToLower()
  $expEtag = Expected-ETag $p.file ([int]$p.parts)
  $integ[$L] = [ordered]@{ head_status=[int]$h.StatusCode; head_size=$headLen; src_size=[int64]$p.size; head_etag=$headEtag; expected_multipart_etag=$expEtag;
    etag_match=($headEtag -eq $expEtag); get_status=[int]$g.StatusCode; get_ms=[math]::Round($sw.Elapsed.TotalMilliseconds,1); dl_size=(Get-Item $dl).Length;
    src_sha256=$p.sha256; dl_sha256=$dlSha; sha256_match=($dlSha -eq $p.sha256); at=(Now) }
  Remove-Item $dl
}
$results['integrity'] = $integ; $results['finished'] = (Get-Date -Format o)
$results | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $dir 'results.json')
"DONE $(Get-Date -Format o)"
