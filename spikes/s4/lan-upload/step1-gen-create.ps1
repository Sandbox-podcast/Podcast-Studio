# S4 LAN test step 1 (desktop-ai): generate random payloads, sha256, CreateMultipartUpload via presigned POST.
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:TEMP 's4-lan-test'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Set-Location $dir
function New-RandomFile($path, [int]$mib) {
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $buf = New-Object byte[] (1MB)
  $fs = [System.IO.File]::Create($path)
  try { for ($i=0; $i -lt $mib; $i++) { $rng.GetBytes($buf); $fs.Write($buf,0,$buf.Length) } } finally { $fs.Close() }
}
$files = @{ 'A' = @('payload-A-64M.bin',64); 'B' = @('payload-B-256M.bin',256); 'C' = @('payload-C-64M.bin',64) }
$meta = @{}
foreach ($k in $files.Keys) {
  $p = Join-Path $dir $files[$k][0]
  New-RandomFile $p $files[$k][1]
  $h = (Get-FileHash -Algorithm SHA256 $p).Hash.ToLower()
  $meta[$k] = @{ file=$p; size=(Get-Item $p).Length; sha256=$h }
}
$meta['D'] = $meta['B']
$create = Get-Content (Join-Path $dir 'create-urls.json') -Raw | ConvertFrom-Json
$client = [System.Net.Http.HttpClient]::new()
$result = @{}
foreach ($prop in $create.PSObject.Properties) {
  $key = $prop.Name; $letter = ($key -split '-')[-3]
  $resp = $client.PostAsync($prop.Value, [System.Net.Http.ByteArrayContent]::new([byte[]]@())).GetAwaiter().GetResult()
  $body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  if (-not $resp.IsSuccessStatusCode) { throw "Create $key failed: $([int]$resp.StatusCode) $body" }
  $uid = ([xml]$body).InitiateMultipartUploadResult.UploadId
  $partSize = 5MB
  $n = [math]::Ceiling($meta[$letter].size / $partSize)
  $result[$letter] = @{ key=$key; uploadId=$uid; parts=$n; file=$meta[$letter].file; size=$meta[$letter].size; sha256=$meta[$letter].sha256 }
}
$result | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $dir 'plan.json')
Get-Date -Format o
$result | ConvertTo-Json -Depth 4
