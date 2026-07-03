# Push Engage canonical URL env vars to Render (backend + frontend).
param(
  [string]$BackendServiceId = 'srv-d6qkjlua2pns73a2r1fg'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'render-env-guard.ps1')
$apiKey = Get-RenderApiKey
$headers = @{ Authorization = "Bearer $apiKey"; Accept = 'application/json' }

$canonical = 'https://capstonesoftware.co.uk/engage'

Write-Host "Updating backend $BackendServiceId..." -ForegroundColor Cyan
Set-RenderEnvVarsSafe -ServiceId $BackendServiceId -SkipDeploy -Updates @{
  FRONTEND_URL        = $canonical
  API_URL             = $canonical
  AUTH_COOKIE_PATH    = '/engage'
  NODE_VERSION        = '20.18.0'
  XERO_REDIRECT_URI   = "$canonical/api/oauth/callback/xero"
  EMAIL_PLATFORM_FROM = 'proposals@capstonesoftware.co.uk'
}

# Find frontend service id
$services = Invoke-RestMethod -Method GET -Uri 'https://api.render.com/v1/services?limit=100' -Headers $headers
$frontend = $services | Where-Object { $_.service.name -eq 'engage-frontend' } | Select-Object -First 1
if ($frontend) {
  $fid = $frontend.service.id
  Write-Host "Updating frontend $fid..." -ForegroundColor Cyan
  $existing = Get-RenderEnvVars -ServiceId $fid -ApiKey $apiKey
  $existing['VITE_API_URL'] = $canonical
  $existing['VITE_APP_BASE'] = '/engage'
  $payload = @(foreach ($key in ($existing.Keys | Sort-Object -Unique)) { @{ key = $key; value = [string]$existing[$key] } })
  Invoke-RestMethod -Method PUT -Uri "https://api.render.com/v1/services/$fid/env-vars" -Headers $headers -ContentType 'application/json' -Body ($payload | ConvertTo-Json -Depth 5 -Compress) | Out-Null
}

Write-Host 'Render env updated for capstonesoftware.co.uk/engage' -ForegroundColor Green