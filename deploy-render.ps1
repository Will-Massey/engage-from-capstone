# Engage by Capstone - Render Deployment Script
# Run this script to deploy to Render

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   ENGAGE - DEPLOY TO RENDER" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if render CLI is installed
try {
    $renderVersion = render --version 2>&1
    Write-Host "✓ Render CLI found: $renderVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Render CLI not found. Installing..." -ForegroundColor Yellow
    npm install -g @render/cli
}

Write-Host ""
Write-Host "Step 1: Building Shared Package..." -ForegroundColor Yellow
cd shared
npm ci
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Shared build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Shared package built" -ForegroundColor Green

Write-Host ""
Write-Host "Step 2: Building Backend..." -ForegroundColor Yellow
cd ../backend
npm ci
npx prisma generate
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Backend build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Backend built" -ForegroundColor Green

Write-Host ""
Write-Host "Step 3: Building Frontend..." -ForegroundColor Yellow
cd ../frontend
npm ci
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Frontend build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Frontend built" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   BUILD COMPLETE!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Go to https://dashboard.render.com/blueprints" -ForegroundColor White
Write-Host "2. Click 'New Blueprint Instance'" -ForegroundColor White
Write-Host "3. Select your GitHub repository" -ForegroundColor White
Write-Host "4. Render will automatically deploy using render.yaml" -ForegroundColor White
Write-Host ""
Write-Host "Or deploy manually following DEPLOY_RENDER.md" -ForegroundColor Gray
Write-Host ""

# Offer to open Render dashboard
$openRender = Read-Host "Open Render Dashboard? (y/n)"
if ($openRender -eq 'y' -or $openRender -eq 'Y') {
    Start-Process "https://dashboard.render.com/blueprints"
}
