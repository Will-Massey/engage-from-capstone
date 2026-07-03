#!/usr/bin/env pwsh
# Restore DATABASE_URL + production secrets on engage-backend and redeploy.
# Run after deploy errors: DATABASE_URL not found / ENCRYPTION_KEY required.

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'render-env-guard.ps1')

Write-Host 'Restoring core Render env (DATABASE_URL, ENCRYPTION_KEY, OAUTH_STATE_SECRET)...' -ForegroundColor Cyan
$count = Set-RenderEnvVarsSafe -ServiceId $RenderEngageBackendId
Write-Host "OK - $count env vars on engage-backend. Deploy triggered." -ForegroundColor Green
Write-Host 'Verify in Render dashboard: engage-backend -> Environment -> DATABASE_URL' -ForegroundColor Gray