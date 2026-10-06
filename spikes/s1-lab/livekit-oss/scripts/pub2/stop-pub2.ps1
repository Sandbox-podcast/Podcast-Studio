# Asks a running launch-pub2.ps1 to stop (it cleans up its own processes). Safe if nothing runs.
param([string]$Root = "$env:USERPROFILE\s1-pub2")
New-Item -ItemType File -Force -Path (Join-Path $Root 'STOP') | Out-Null
Write-Host "STOP requested $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')"
