# Push Engage canonical URL env vars to Render (backend + frontend).
param(
  [string]$BackendServiceId = 'srv-d6qkjlua2pns73a2r1fg'
)

$ErrorActionPreference = 'Stop'
$apiKey = $env:RENDER_API_KEY
if (-not $apiKey) {
  $keyFile = 'C:\Users\willi\boardroom\deploy\.render-api-key'
  if (Test-Path $keyFile) { $apiKey = (Get-Content $keyFile -Raw).Trim() }
}
if (-not $apiKey) { throw 'RENDER_API_KEY not set' }

$headers = @{ Authorization = "Bearer $apiKey"; Accept = 'application/json' }

function Get-RenderEnvVars($serviceId) {
  $existing = @{}
  $cursor = $null
  do {
    $path = "/services/$serviceId/env-vars?limit=100"
    if ($cursor) { $path += "&cursor=$cursor" }
    $page = Invoke-RestMethod -Method GET -Uri "https://api.render.com/v1$path" -Headers $headers
    foreach ($item in $page) { $existing[$item.envVar.key] = $item.envVar.value }
    $cursor = if ($page.Count -gt 0) { $page[-1].cursor } else { $null }
  } while ($cursor -and $page.Count -eq 100)
  return $existing
}

function Set-RenderEnvVars($serviceId, $updates) {
  $existing = Get-RenderEnvVars $serviceId
  foreach ($kv in $updates.GetEnumerator()) { $existing[$kv.Key] = $kv.Value }
  $payload = @(
    foreach ($key in $existing.Keys) {
      @{ key = $key; value = [string]$existing[$key] }
    }
  )
  Invoke-RestMethod -Method PUT -Uri "https://api.render.com/v1/services/$serviceId/env-vars" -Headers $headers -ContentType 'application/json' -Body ($payload | ConvertTo-Json -Depth 5 -Compress) | Out-Null
}

$canonical = 'https://capstonesoftware.co.uk/engage'

Write-Host "Updating backend $BackendServiceId..." -ForegroundColor Cyan
Set-RenderEnvVars $BackendServiceId @{
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
  Set-RenderEnvVars $fid @{
    VITE_API_URL  = $canonical
    VITE_APP_BASE = '/engage'
  }
}

Write-Host 'Render env updated for capstonesoftware.co.uk/engage' -ForegroundColor Green