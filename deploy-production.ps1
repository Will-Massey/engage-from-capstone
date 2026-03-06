# Engage by Capstone - Production Deployment Script
# Run this from PowerShell after configuring environment variables

param(
    [switch]$SkipDatabaseSetup,
    [switch]$SkipBackendDeploy,
    [switch]$SkipFrontendDeploy
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Engage by Capstone - Production Deploy" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

# Check if Railway CLI is installed
$railwayInstalled = Get-Command railway -ErrorAction SilentlyContinue
if (-not $railwayInstalled) {
    Write-Host "Railway CLI not found. Installing..." -ForegroundColor Yellow
    npm install -g @railway/cli
}

# Check if Vercel CLI is installed
$vercelInstalled = Get-Command vercel -ErrorAction SilentlyContinue
if (-not $vercelInstalled) {
    Write-Host "Vercel CLI not found. Installing..." -ForegroundColor Yellow
    npm install -g vercel
}

Write-Host "✓ Prerequisites checked" -ForegroundColor Green
Write-Host ""

# ============================================
# STEP 1: Database Setup (Neon)
# ============================================
if (-not $SkipDatabaseSetup) {
    Write-Host "STEP 1: Database Setup" -ForegroundColor Cyan
    Write-Host "----------------------------------------" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "You'll need to:"
    Write-Host "1. Go to https://neon.tech and sign up"
    Write-Host "2. Create a new project called 'engage-production'"
    Write-Host "3. Get the connection string from Connection Details"
    Write-Host "4. Add it to backend/.env.production as DATABASE_URL"
    Write-Host ""
    
    $dbReady = Read-Host "Have you set up the Neon database and updated .env.production? (y/n)"
    if ($dbReady -ne 'y') {
        Write-Host "Please set up the database first, then run this script again." -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "✓ Database configured" -ForegroundColor Green
    Write-Host ""
}

# ============================================
# STEP 2: Backend Deployment (Railway)
# ============================================
if (-not $SkipBackendDeploy) {
    Write-Host "STEP 2: Backend Deployment (Railway)" -ForegroundColor Cyan
    Write-Host "----------------------------------------" -ForegroundColor Cyan
    Write-Host ""
    
    # Check if backend .env.production is configured
    $backendEnv = Get-Content "backend/.env.production" -Raw
    if ($backendEnv -match "your-production-jwt-secret" -or 
        $backendEnv -match "add-your-secret-here" -or
        $backendEnv -match "your-neon-connection-string") {
        Write-Host "ERROR: backend/.env.production still has placeholder values!" -ForegroundColor Red
        Write-Host "Please fill in all required environment variables first." -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "Logging into Railway..." -ForegroundColor Yellow
    railway login
    
    Write-Host "Initializing Railway project..." -ForegroundColor Yellow
    Set-Location backend
    
    # Check if already linked
    $linked = railway status 2>$null
    if ($LASTEXITCODE -ne 0) {
        railway init --name engage-backend
    }
    
    Write-Host "Setting environment variables..." -ForegroundColor Yellow
    # Load .env.production and set variables
    Get-Content .env.production | ForEach-Object {
        if ($_ -match "^([^#][^=]+)=(.+)$") {
            $key = $matches[1]
            $value = $matches[2] -replace '"', ''
            if ($value -and $value -notmatch "your-" -and $value -notmatch "add-") {
                railway variables set $key="$value" 2>$null
                Write-Host "  Set $key" -ForegroundColor Gray
            }
        }
    }
    
    Write-Host "Deploying backend..." -ForegroundColor Yellow
    railway up
    
    Write-Host "Running database migrations..." -ForegroundColor Yellow
    railway run npx prisma migrate deploy
    
    Write-Host "Seeding database with default services..." -ForegroundColor Yellow
    railway run npx prisma db seed 2>$null
    
    Set-Location ..
    
    Write-Host "✓ Backend deployed" -ForegroundColor Green
    Write-Host ""
}

# ============================================
# STEP 3: Frontend Deployment (Vercel)
# ============================================
if (-not $SkipFrontendDeploy) {
    Write-Host "STEP 3: Frontend Deployment (Vercel)" -ForegroundColor Cyan
    Write-Host "----------------------------------------" -ForegroundColor Cyan
    Write-Host ""
    
    # Check if frontend .env.production is configured
    $frontendEnv = Get-Content "frontend/.env.production" -Raw
    if ($frontendEnv -match "your-railway-url") {
        Write-Host "ERROR: frontend/.env.production still has placeholder values!" -ForegroundColor Red
        Write-Host "Please update VITE_API_URL with your Railway deployment URL." -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "Logging into Vercel..." -ForegroundColor Yellow
    vercel login
    
    Set-Location frontend
    
    Write-Host "Deploying frontend to production..." -ForegroundColor Yellow
    vercel --prod
    
    Set-Location ..
    
    Write-Host "✓ Frontend deployed" -ForegroundColor Green
    Write-Host ""
}

# ============================================
# STEP 4: Post-Deployment Verification
# ============================================
Write-Host "STEP 4: Post-Deployment Verification" -ForegroundColor Cyan
Write-Host "----------------------------------------" -ForegroundColor Cyan
Write-Host ""

Write-Host "Checking health endpoints..." -ForegroundColor Yellow

# Try to ping the backend health endpoint
$backendUrl = "https://engage-backend-production.up.railway.app"
try {
    $response = Invoke-RestMethod -Uri "$backendUrl/health" -Method GET -TimeoutSec 10
    Write-Host "✓ Backend health check passed" -ForegroundColor Green
} catch {
    Write-Host "⚠ Backend health check failed - may need a few minutes to start" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "1. Configure your domain DNS to point to Vercel/Railway"
Write-Host "2. Set up Stripe webhook endpoint"
Write-Host "3. Configure Azure AD redirect URIs for production"
Write-Host "4. Test the application end-to-end"
Write-Host ""
Write-Host "Backend URL: $backendUrl" -ForegroundColor Gray
Write-Host "Frontend URL: https://engagebycapstone.co.uk (after DNS setup)" -ForegroundColor Gray
Write-Host ""
