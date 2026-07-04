#!/usr/bin/env pwsh
# Remove stale SUPERADMIN_API_KEY from engage-backend (HMAC ingest works without it).
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'render-env-guard.ps1')

$apiKey = Get-RenderApiKey
$headers = @{ Authorization = "Bearer $apiKey"; 'Content-Type' = 'application/json' }

$existing = Get-RenderEnvVars -ServiceId $RenderEngageBackendId -ApiKey $apiKey

if (-not $existing.ContainsKey('SUPERADMIN_API_KEY')) {
  Write-Host 'SUPERADMIN_API_KEY not set on engage-backend — nothing to remove.' -ForegroundColor Yellow
  exit 0
}

Write-Host 'Removing SUPERADMIN_API_KEY from engage-backend...' -ForegroundColor Cyan
$existing.Remove('SUPERADMIN_API_KEY')
[void](Ensure-RenderCoreEnvVars -EnvMap $existing)

$payload = @(
  foreach ($key in ($existing.Keys | Sort-Object -Unique)) {
    @{ key = $key; value = [string]$existing[$key] }
  }
)

Invoke-RestMethod -Method PUT -Uri "https://api.render.com/v1/services/$RenderEngageBackendId/env-vars" -Headers $headers -Body ($payload | ConvertTo-Json -Depth 5 -Compress) | Out-Null

$verify = Get-RenderEnvVars -ServiceId $RenderEngageBackendId -ApiKey $apiKey
if ($verify.ContainsKey('SUPERADMIN_API_KEY')) {
  throw 'SUPERADMIN_API_KEY still present after PUT'
}

$deployBody = @{ clearCache = 'do_not_clear' } | ConvertTo-Json -Compress
Invoke-RestMethod -Method POST -Uri "https://api.render.com/v1/services/$RenderEngageBackendId/deploys" -Headers @{ Authorization = "Bearer $apiKey" } -ContentType 'application/json' -Body $deployBody | Out-Null

Write-Host 'OK — SUPERADMIN_API_KEY removed. Redeploy triggered.' -ForegroundColor Green
Write-Host "Kept: SUPERADMIN_URL=$($verify['SUPERADMIN_URL']) webhook secret present=$($verify.ContainsKey('SUPERADMIN_WEBHOOK_SECRET'))" -ForegroundColor Gray