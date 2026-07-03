#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Sync engage-backend Render build/start commands with render.yaml (fixes deploys that skip tsc).
#>
param(
  [string]$ServiceId = 'srv-d6qkjlua2pns73a2r1fg',
  [switch]$SkipDeploy
)

$ErrorActionPreference = 'Stop'

$apiKey = $env:RENDER_API_KEY
if (-not $apiKey) {
  $keyFile = 'C:\Users\willi\boardroom\deploy\.render-api-key'
  if (Test-Path $keyFile) { $apiKey = (Get-Content $keyFile -Raw).Trim() }
}
if (-not $apiKey) { throw 'RENDER_API_KEY not set' }

$headers = @{ Authorization = "Bearer $apiKey"; 'Content-Type' = 'application/json' }

# Must match render.yaml engage-backend service
$buildCommand = @"
npm ci &&
npm run build:shared &&
npm run build:backend
"@.Trim()

$startCommand = 'cd backend && npm start'

$body = @{
  serviceDetails = @{
    envSpecificDetails = @{
      buildCommand = $buildCommand
      startCommand = $startCommand
    }
  }
} | ConvertTo-Json -Depth 5 -Compress

Write-Host "Syncing build/start for $ServiceId..." -ForegroundColor Cyan
$result = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$ServiceId" -Method PATCH -Headers $headers -Body $body
Write-Host "Build: $($result.serviceDetails.envSpecificDetails.buildCommand)" -ForegroundColor Green
Write-Host "Start: $($result.serviceDetails.envSpecificDetails.startCommand)" -ForegroundColor Green

if (-not $SkipDeploy) {
  Write-Host 'Triggering deploy...' -ForegroundColor Yellow
  $deploy = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$ServiceId/deploys" -Method POST -Headers $headers -Body '{"clearCache":"do_not_clear"}'
  $deployId = if ($deploy.id) { $deploy.id } else { $deploy.deploy.id }
  Write-Host "Deploy: $deployId" -ForegroundColor Green
  Write-Host "https://dashboard.render.com/web/$ServiceId/events"
}