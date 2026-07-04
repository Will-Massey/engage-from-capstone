#!/usr/bin/env pwsh
# Set JWT_REFRESH_SECRET on engage-backend (required after P1 auth hardening).
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'render-env-guard.ps1')

$existing = Get-RenderEnvVars -ServiceId $RenderEngageBackendId
$jwtSecret = $existing['JWT_SECRET']

if (-not $jwtSecret -or [string]::IsNullOrWhiteSpace($jwtSecret)) {
  throw 'JWT_SECRET missing on engage-backend — set it in Render before adding JWT_REFRESH_SECRET'
}

$refreshSecret = $existing['JWT_REFRESH_SECRET']
if ($refreshSecret -and $refreshSecret.Length -ge 32 -and $refreshSecret -ne $jwtSecret) {
  Write-Host 'JWT_REFRESH_SECRET already set on engage-backend — triggering redeploy only.' -ForegroundColor Yellow
  $count = Set-RenderEnvVarsSafe -ServiceId $RenderEngageBackendId -Updates @{} 
  Write-Host "OK — $count env vars. Redeploy triggered." -ForegroundColor Green
  exit 0
}

do {
  $refreshSecret = (New-RandomSecretHex -Bytes 32).Trim()
} while ($refreshSecret -eq $jwtSecret)

Write-Host 'Setting JWT_REFRESH_SECRET on engage-backend...' -ForegroundColor Cyan
$count = Set-RenderEnvVarsSafe -ServiceId $RenderEngageBackendId -Updates @{ JWT_REFRESH_SECRET = $refreshSecret }
Write-Host "OK — $count env vars. Redeploy triggered." -ForegroundColor Green

$verify = Get-RenderEnvVars -ServiceId $RenderEngageBackendId
if (-not $verify['JWT_REFRESH_SECRET'] -or $verify['JWT_REFRESH_SECRET'].Length -lt 32) {
  throw 'Verification failed — JWT_REFRESH_SECRET not present after PUT'
}
Write-Host 'Verified JWT_REFRESH_SECRET is set (value not logged).' -ForegroundColor Gray