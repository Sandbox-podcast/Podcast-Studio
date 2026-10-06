# S4 LAN test step 3 (desktop-ai): delete the synthetic test objects (prefix spike/s4-lan/lan-test-*), verify, remove local files.
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:TEMP 's4-lan-test'; Set-Location $dir
$urls = Get-Content urls.json -Raw | ConvertFrom-Json
$cu = Get-Content cleanup-urls.json -Raw | ConvertFrom-Json
$client = [System.Net.Http.HttpClient]::new()
function Keys($xml) { @(([xml]$xml).ListBucketResult.Contents | Where-Object { $_ } | ForEach-Object { $_.Key }) }
$before = Keys $client.GetStringAsync($cu.list_objects).Result
"objects_before: $($before -join ', ')"
foreach ($L in 'A','B','C','D') {
  $k = $urls.$L.key
  if ($k -notlike 'spike/s4-lan/lan-test-*') { throw "refusing to delete $k" }
  $r = $client.DeleteAsync($urls.$L.delete).GetAwaiter().GetResult()
  "DELETE $k -> $([int]$r.StatusCode)"
}
$after = Keys $client.GetStringAsync($cu.list_objects).Result
"objects_after: [$($after -join ', ')]"
$up = $client.GetStringAsync($cu.list_uploads).Result
$pending = @(([xml]$up).ListMultipartUploadsResult.Upload | Where-Object { $_ } | ForEach-Object { $_.Key })
"pending_multipart_uploads: [$($pending -join ', ')]"
$client.Dispose()
"link: " + ((Get-NetAdapter | Where-Object Status -eq 'Up' | ForEach-Object { "$($_.Name) $($_.InterfaceDescription) $($_.LinkSpeed)" }) -join ' | ')
"route: " + ((Find-NetRoute -RemoteIPAddress 192.168.1.68 | Select-Object -First 1).InterfaceAlias)
Set-Location $env:TEMP
Remove-Item -Recurse -Force $dir
"local_dir_exists_after: $(Test-Path $dir)"
"at $(Get-Date -Format o)"
