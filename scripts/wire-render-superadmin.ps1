#!/usr/bin/env pwsh
# Wire SUPERADMIN_URL + SUPERADMIN_WEBHOOK_SECRET on engage-backend (no API key — HMAC only).
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'render-env-guard.ps1')

$engageEnvPath = Join-Path (Split-Path $PSScriptRoot -Parent | Split-Path -Parent) 'capstone-superadmin\scripts\engage-env.json'
if (-not (Test-Path $engageEnvPath)) {
  $engageEnvPath = 'C:\Users\willi\capstone-superadmin\scripts\engage-env.json'
}

$raw = Get-Content $engageEnvPath -Raw
$json = $raw.Substring($raw.IndexOf('{')) | ConvertFrom-Json
$engage = $json.engage

$updates = @{
  SUPERADMIN_URL = $engage.SUPERADMIN_URL
  SUPERADMIN_WEBHOOK_SECRET = $engage.SUPERADMIN_WEBHOOK_SECRET
}

Write-Host 'Setting SUPERADMIN_URL + SUPERADMIN_WEBHOOK_SECRET on engage-backend...' -ForegroundColor Cyan
$count = Set-RenderEnvVarsSafe -ServiceId $RenderEngageBackendId -Updates $updates
Write-Host "OK — $count env vars. Redeploy triggered." -ForegroundColor Green