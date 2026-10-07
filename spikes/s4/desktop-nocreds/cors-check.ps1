# Read-only CORS preflight check against MinIO for a browser PUT from http://localhost:<port>. No auth, no writes.
# Unsigned OPTIONS only (fake uploadId): it proves the CORS headers, not the signature.
param([int]$Port = 3340, [string]$Endpoint = 'http://192.168.1.68:9000', [string]$Bucket = 'podcast-recordings-poc')
$origin = "http://localhost:$Port"
$url = "$Endpoint/$Bucket/spike/s4-desktop/cors-preflight-probe?partNumber=1&uploadId=x"
$r = Invoke-WebRequest -Uri $url -Method Options -UseBasicParsing -SkipHttpErrorCheck -TimeoutSec 5 -Headers @{
  Origin = $origin; 'Access-Control-Request-Method' = 'PUT'; 'Access-Control-Request-Headers' = 'content-type' }
"preflight PUT from $origin -> HTTP $($r.StatusCode)"
foreach ($k in 'Access-Control-Allow-Origin','Access-Control-Allow-Methods','Access-Control-Allow-Headers','Access-Control-Expose-Headers','Access-Control-Allow-Credentials','Vary') { "  ${k}: $($r.Headers[$k])" }
