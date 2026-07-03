#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Push Cloudflare email env vars to engage-backend on Render.
#>
param(
  [string]$ServiceName = 'engage-backend',
  [string]$ServiceId = 'srv-d6qkjlua2pns73a2r1fg',
  [switch]$SkipDeploy
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path $PSScriptRoot -Parent
$EnvSources = @(
  (Join-Path $RepoRoot '.env'),
  'C:\Users\willi\Cline Workspace\capstone-engage\.env'
)

$apiKey = $env:RENDER_API_KEY
if (-not $apiKey) {
  $keyFile = 'C:\Users\willi\boardroom\deploy\.render-api-key'
  if (Test-Path $keyFile) {
    $apiKey = (Get-Content $keyFile -Raw).Trim()
  }
}
if (-not $apiKey) { throw 'RENDER_API_KEY not set' }

$headers = @{ Authorization = "Bearer $apiKey"; Accept = 'application/json' }

function Invoke-RenderApi {
  param([string]$Method, [string]$Path, $Body = $null)
  $uri = "https://api.render.com/v1$Path"
  $params = @{ Method = $Method; Uri = $uri; Headers = $headers }
  if ($Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
  }
  return Invoke-RestMethod @params
}

if (-not $ServiceId) {
  $services = Invoke-RenderApi -Method GET -Path '/services?limit=100'
  $match = $services | Where-Object { $_.service.name -eq $ServiceName } | Select-Object -First 1
  if (-not $match) { throw "Service '$ServiceName' not found" }
  $ServiceId = $match.service.id
}

Write-Host "Service: $ServiceName ($ServiceId)" -ForegroundColor Cyan

$existing = @{}
$cursor = $null
do {
  $path = "/services/$ServiceId/env-vars?limit=100"
  if ($cursor) { $path += "&cursor=$cursor" }
  $page = Invoke-RenderApi -Method GET -Path $path
  foreach ($item in $page) { $existing[$item.envVar.key] = $item.envVar.value }
  $cursor = if ($page.Count -gt 0) { $page[-1].cursor } else { $null }
} while ($cursor -and $page.Count -eq 100)

$emailKeys = @(
  'EMAIL_WORKER_URL', 'EMAIL_WORKER_SECRET', 'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_EMAIL_API_TOKEN', 'EMAIL_PLATFORM_FROM', 'EMAIL_PLATFORM_FROM_NAME',
  'EMAIL_FROM_ADDRESS', 'EMAIL_FROM_NAME', 'EMAIL_REPLY_TO', 'EMAIL_DEFAULT_REPLY_TO_FALLBACK'
)

foreach ($envPath in $EnvSources) {
  if (-not (Test-Path $envPath)) { continue }
  foreach ($line in Get-Content $envPath) {
    if ($line -match '^\s*#' -or $line -match '^\s*$') { continue }
    if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      $key = $Matches[1]
      if ($emailKeys -contains $key -and $Matches[2]) {
        $existing[$key] = $Matches[2]
      }
    }
  }
}

# Production defaults for Engage
if (-not $existing['EMAIL_WORKER_URL']) {
  $existing['EMAIL_WORKER_URL'] = 'https://capstone-engage-email.william-19a.workers.dev'
}
if (-not $existing['CLOUDFLARE_ACCOUNT_ID']) {
  $existing['CLOUDFLARE_ACCOUNT_ID'] = '19ad15686e6bd22ab2896661ac1976f1'
}
# Cloudflare Email Sending is onboarded for capstonesoftware.co.uk only (not engage.* subdomain)
$existing['EMAIL_PLATFORM_FROM'] = 'proposals@capstonesoftware.co.uk'
if (-not $existing['EMAIL_PLATFORM_FROM_NAME']) { $existing['EMAIL_PLATFORM_FROM_NAME'] = 'Engage by Capstone' }

if (-not $existing['EMAIL_WORKER_SECRET']) {
  throw 'EMAIL_WORKER_SECRET missing — set in capstone-engage/.env'
}

$payload = @(
  foreach ($key in ($existing.Keys | Sort-Object -Unique)) {
    @{ key = $key; value = [string]$existing[$key] }
  }
)

Write-Host "Setting $($payload.Count) environment variables (email keys ensured)..." -ForegroundColor Yellow
Invoke-RenderApi -Method PUT -Path "/services/$ServiceId/env-vars" -Body $payload | Out-Null
Write-Host 'Environment updated.' -ForegroundColor Green

if (-not $SkipDeploy) {
  Write-Host 'Triggering deploy...' -ForegroundColor Yellow
  # clearCache must be the string "clear" or "do_not_clear" (not a boolean).
  $deploy = Invoke-RenderApi -Method POST -Path "/services/$ServiceId/deploys" -Body @{ clearCache = 'do_not_clear' }
  $deployId = if ($deploy.id) { $deploy.id } else { $deploy.deploy.id }
  Write-Host "Deploy started: $deployId" -ForegroundColor Green
}