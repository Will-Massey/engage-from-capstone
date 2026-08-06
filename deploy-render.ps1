# Engage by Capstone — deploy via Render API / CI
# Preferred: merge to master (GitHub Actions Deploy to Render).
# Manual: set RENDER_API_KEY, RENDER_BACKEND_SERVICE_ID, RENDER_FRONTEND_SERVICE_ID
# and run scripts\deploy.ps1. See DEPLOY.md.

$ErrorActionPreference = 'Stop'

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   ENGAGE - DEPLOY TO RENDER (Neon DB)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Step 1: Building Shared Package..." -ForegroundColor Yellow
Push-Location shared
try {
    npm ci
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Shared build failed" }
    Write-Host "Shared package built" -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Step 2: Building Backend..." -ForegroundColor Yellow
Push-Location backend
try {
    npm ci
    npx prisma generate
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Backend build failed" }
    Write-Host "Backend built" -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Step 3: Building Frontend..." -ForegroundColor Yellow
Push-Location frontend
try {
    npm ci
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
    Write-Host "Frontend built" -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host ""
if ($env:RENDER_API_KEY -and (Test-Path (Join-Path $PSScriptRoot 'scripts\deploy.ps1'))) {
    Write-Host "Triggering Render API deploys..." -ForegroundColor Yellow
    & (Join-Path $PSScriptRoot 'scripts\deploy.ps1')
} else {
    Write-Host "Local builds done. Deploy by merging to master, or set RENDER_* secrets and run scripts\deploy.ps1." -ForegroundColor Cyan
    Write-Host "Live: https://capstonesoftware.co.uk/engage" -ForegroundColor Cyan
}
