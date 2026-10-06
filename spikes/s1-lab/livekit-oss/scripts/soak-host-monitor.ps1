param(
  [string]$OutDir,
  [int]$DurationSec = 1800,
  [int]$IntervalSec = 60,
  [string]$Room = 's1-soak'
)
$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$csv = Join-Path $OutDir 'host-metrics.csv'
'ts_paris,livekit_cpu,livekit_mem,harness_cpu,harness_mem,laptop_cpu_pct' | Set-Content -Encoding utf8 $csv
$partLog = Join-Path $OutDir 'participants.log'
$end = (Get-Date).AddSeconds($DurationSec)
$idx = 0
while ((Get-Date) -lt $end) {
  $idx++
  $ts = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
  $stats = docker stats --no-stream --format '{{.Name}},{{.CPUPerc}},{{.MemUsage}}' 2>$null
  $lkCpu=''; $lkMem=''; $hCpu=''; $hMem=''
  foreach ($line in $stats) {
    if ($line -match '^s1-livekit-oss-livekit-1,([^,]+),(.+)$') { $lkCpu=$Matches[1]; $lkMem=$Matches[2] }
    if ($line -match '^s1-harness,([^,]+),(.+)$') { $hCpu=$Matches[1]; $hMem=$Matches[2] }
  }
  $cpu = ''
  try {
    $c = Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction Stop
    $cpu = [math]::Round($c.CounterSamples[0].CookedValue,1)
  } catch { $cpu = 'NA' }
  Add-Content -Encoding utf8 $csv "$ts,$lkCpu,$lkMem,$hCpu,$hMem,$cpu"
  if ($idx % 5 -eq 1) {
    $part = docker exec s1-harness node -e "const {RoomServiceClient}=require('livekit-server-sdk'); const c=new RoomServiceClient('http://host.docker.internal:7880','API_S1_LAB_DEV_PLACEHOLDER','secret_s1_lab_placeholder_not_for_production'); c.listParticipants('$Room').then(p=>console.log(JSON.stringify(p.map(x=>({identity:x.identity,state:x.state,tracks:(x.tracks||[]).map(t=>({type:t.type,muted:t.muted,name:t.name}))})),(_,v)=>typeof v==='bigint'?Number(v):v))).catch(e=>console.error(String(e)))" 2>&1
    Add-Content -Encoding utf8 $partLog "$ts $part"
  }
  Write-Host "[mon $ts] lk=$lkCpu cpu=$cpu"
  Start-Sleep -Seconds $IntervalSec
}
Write-Host 'monitor done'