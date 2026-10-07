# Phase-2 step A (desktop-ai): execute the box-presigned CreateMultipartUpload (POST ?uploads); prints UploadId.
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$c = Get-Content (Join-Path $dir 'create.json') -Raw | ConvertFrom-Json
$client = [System.Net.Http.HttpClient]::new()
$content = [System.Net.Http.ByteArrayContent]::new([byte[]]@())
$content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new('video/webm')
$resp = $client.PostAsync($c.create, $content).GetAwaiter().GetResult()
$body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
$client.Dispose()
if (-not $resp.IsSuccessStatusCode) { throw "Create failed: $([int]$resp.StatusCode) $body" }
$uid = ([xml]$body).InitiateMultipartUploadResult.UploadId
Set-Content (Join-Path $dir 'upload-id.txt') $uid -NoNewline
"key=$($c.key)"
"UPLOAD_ID=$uid"
