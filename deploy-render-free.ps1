#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy Engage by Capstone to Render (FREE TIER)
.DESCRIPTION
    Deploys to Render using the free tier - sleeps after 15 min inactivity to prevent costs
.NOTES
    Free tier: $0/month, auto-sleep after 15 min, wakes on request (~30s cold start)
#>

$ErrorActionPreference = "Stop"

Write-Host @"
╔════════════════════════════════════════════════════════════════╗
║     Engage by Capstone - Render Deployment (FREE TIER)         ║
║                                                                ║
║  💰 Cost: $0/month                                            ║
║  😴 Auto-sleeps after 15 min inactivity                       ║
║  ⚡ Wakes on request (~30s cold start)                        ║
╚════════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

Write-Host "`n📋 Pre-deployment Checklist:" -ForegroundColor Yellow
Write-Host "  1. Push latest code to GitHub" -ForegroundColor White
Write-Host "  2. Have your SMTP credentials ready" -ForegroundColor White
Write-Host "  3. (Optional) Companies House API key" -ForegroundColor White

# Check Git status
Write-Host "`n📊 Checking Git status..." -ForegroundColor Yellow
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "  ⚠️  You have uncommitted changes:" -ForegroundColor Red
    Write-Host $gitStatus -ForegroundColor Gray
    $continue = Read-Host "`nContinue anyway? (y/n)"
    if ($continue -ne 'y') { exit }
} else {
    Write-Host "  ✅ Working directory clean" -ForegroundColor Green
}

# Show deployment steps
Write-Host "`n`n🚀 Deployment Steps:" -ForegroundColor Cyan
Write-Host "====================" -ForegroundColor Cyan

Write-Host "`nStep 1: Create PostgreSQL Database (Free Tier)" -ForegroundColor Yellow
Write-Host "  1. Go to https://dashboard.render.com" -ForegroundColor White
Write-Host "  2. Click 'New' → 'PostgreSQL'" -ForegroundColor White
Write-Host "  3. Name: engage-db" -ForegroundColor White
Write-Host "  4. Plan: 'Free' ($0)" -ForegroundColor White
Write-Host "  5. Click 'Create Database'" -ForegroundColor White
Write-Host "  6. Copy the 'Internal Database URL'" -ForegroundColor White
Write-Host "  7. Also copy the 'PSQL Command' for reference" -ForegroundColor White

Write-Host "`nStep 2: Deploy Backend (Free Tier)" -ForegroundColor Yellow
Write-Host "  1. Click 'New' → 'Web Service'" -ForegroundColor White
Write-Host "  2. Connect your GitHub repository" -ForegroundColor White
Write-Host "  3. Configure:" -ForegroundColor White
Write-Host "     - Name: engage-backend" -ForegroundColor Gray
Write-Host "     - Root Directory: backend" -ForegroundColor Gray
Write-Host "     - Runtime: Node" -ForegroundColor Gray
Write-Host "     - Branch: main" -ForegroundColor Gray
Write-Host "     - Build Command:" -ForegroundColor Gray
Write-Host "       npm ci && cd ../shared && npm ci && npm run build && cd ../backend && npx prisma generate && npm run build" -ForegroundColor Gray
Write-Host "     - Start Command: npm start" -ForegroundColor Gray
Write-Host "     - Plan: Free" -ForegroundColor Gray
Write-Host "  4. Click 'Advanced' → Add Environment Variables (see below)" -ForegroundColor White
Write-Host "  5. Click 'Create Web Service'" -ForegroundColor White

Write-Host "`nStep 3: Environment Variables for Backend" -ForegroundColor Yellow
Write-Host "  Required:" -ForegroundColor Green
Write-Host "    NODE_ENV=production" -ForegroundColor Gray
Write-Host "    PORT=10000" -ForegroundColor Gray
Write-Host "    DATABASE_URL=<paste from Step 1>" -ForegroundColor Gray
Write-Host "    JWT_SECRET=<generate with: node -e `"console.log(require('crypto').randomBytes(32).toString('hex'))`">" -ForegroundColor Gray
Write-Host "    FRONTEND_URL=https://engage-frontend.onrender.com" -ForegroundColor Gray
Write-Host "  Email (SMTP):" -ForegroundColor Green
Write-Host "    EMAIL_PROVIDER=smtp" -ForegroundColor Gray
Write-Host "    SMTP_HOST=smtp.123-reg.co.uk" -ForegroundColor Gray
Write-Host "    SMTP_PORT=587" -ForegroundColor Gray
Write-Host "    SMTP_USER=william@capstonesoftware.co.uk" -ForegroundColor Gray
Write-Host "    SMTP_PASS=<your password>" -ForegroundColor Gray
Write-Host "    EMAIL_FROM_NAME='Engage by Capstone'" -ForegroundColor Gray
Write-Host "    EMAIL_FROM_ADDRESS=william@capstonesoftware.co.uk" -ForegroundColor Gray

Write-Host "`nStep 4: Deploy Frontend (Free Static Site)" -ForegroundColor Yellow
Write-Host "  1. Click 'New' → 'Static Site'" -ForegroundColor White
Write-Host "  2. Connect your GitHub repository" -ForegroundColor White
Write-Host "  3. Configure:" -ForegroundColor White
Write-Host "     - Name: engage-frontend" -ForegroundColor Gray
Write-Host "     - Root Directory: frontend" -ForegroundColor Gray
Write-Host "     - Build Command: npm ci && npm run build" -ForegroundColor Gray
Write-Host "     - Publish Directory: dist" -ForegroundColor Gray
Write-Host "  4. Add Environment Variable:" -ForegroundColor White
Write-Host "     VITE_API_URL=<your backend URL from Step 2>" -ForegroundColor Gray
Write-Host "  5. Click 'Create Static Site'" -ForegroundColor White

Write-Host "`nStep 5: Run Database Migrations" -ForegroundColor Yellow
Write-Host "  1. Go to your backend service in Render Dashboard" -ForegroundColor White
Write-Host "  2. Click 'Shell' tab" -ForegroundColor White
Write-Host "  3. Run: npx prisma migrate deploy" -ForegroundColor White
Write-Host "  4. (Optional) Seed: npx prisma db seed" -ForegroundColor White

Write-Host "`n📊 Cost Breakdown (Free Tier):" -ForegroundColor Cyan
Write-Host "  Backend Web Service:  $0 (sleeps after 15 min)" -ForegroundColor Gray
Write-Host "  Frontend Static Site: $0 (always free)" -ForegroundColor Gray
Write-Host "  PostgreSQL Database:  $0 (1GB limit, 90-day expiry)" -ForegroundColor Gray
Write-Host "  Bandwidth:           $0 (100GB/month)" -ForegroundColor Gray
Write-Host "  -----------------------------------" -ForegroundColor Gray
Write-Host "  TOTAL:               $0/month" -ForegroundColor Green

Write-Host "`n⚠️  Important Notes:" -ForegroundColor Red
Write-Host "  • Free PostgreSQL expires after 90 days (backup before!)" -ForegroundColor Yellow
Write-Host "  • Web service sleeps after 15 min inactivity" -ForegroundColor Yellow
Write-Host "  • First request after sleep takes ~30 seconds to wake" -ForegroundColor Yellow
Write-Host "  • Upgrade to Starter ($7/mo) if you need 24/7 uptime" -ForegroundColor Yellow

Write-Host "`n✅ Post-Deployment Verification:" -ForegroundColor Cyan
Write-Host "  Test these URLs:" -ForegroundColor White
Write-Host "    Health: https://engage-backend-xxxxx.onrender.com/api/health" -ForegroundColor Gray
Write-Host "    Login:  https://engage-frontend-xxxxx.onrender.com/login" -ForegroundColor Gray
Write-Host "  Demo credentials: admin@demo.practice / DemoPass123!" -ForegroundColor Gray

Write-Host "`n`nPress Enter to open Render Dashboard..." -ForegroundColor Cyan
Read-Host
Start-Process "https://dashboard.render.com"
