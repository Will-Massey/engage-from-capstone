# Deploy Engage production via Render API (Neon is DATABASE_URL on the service).
# Requires: RENDER_API_KEY, RENDER_BACKEND_SERVICE_ID, RENDER_FRONTEND_SERVICE_ID
# Prefer: merge to master (GitHub Actions) or scripts/deploy.ps1 / scripts/deploy.sh

$ErrorActionPreference = 'Stop'

if (-not $env:RENDER_API_KEY) {
    Write-Host "Set RENDER_API_KEY (and service IDs). Prefer merge-to-master CI deploy." -ForegroundColor Yellow
    Write-Host "See DEPLOY.md and docs/agent-handover.md" -ForegroundColor Cyan
    exit 1
}

$deployScript = Join-Path $PSScriptRoot 'scripts\deploy.ps1'
if (Test-Path $deployScript) {
    & $deployScript
    exit $LASTEXITCODE
}

Write-Host "scripts/deploy.ps1 not found. Trigger deploys from the Render dashboard or merge to master." -ForegroundColor Yellow
exit 1
