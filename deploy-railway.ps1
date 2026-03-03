#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy Engage by Capstone to Railway
.DESCRIPTION
    Automates deployment process including database setup, environment variables, and deployment
#>

param(
    [Parameter()]
    [switch]$SetupOnly,
    
    [Parameter()]
    [switch]$SkipBuild,
    
    [Parameter()]
    [string]$Environment = "production"
)

$ErrorActionPreference = "Stop"

Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║           Engage by Capstone - Railway Deployer              ║
╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

# Check prerequisites
function Test-Prerequisites {
    Write-Host "`n📋 Checking prerequisites..." -ForegroundColor Yellow
    
    # Check Railway CLI
    try {
        $railwayVersion = railway --version 2>$null
        Write-Host "  ✅ Railway CLI: $railwayVersion" -ForegroundColor Green
    } catch {
        Write-Host "  ❌ Railway CLI not found. Installing..." -ForegroundColor Red
        npm install -g @railway/cli
    }
    
    # Check Git
    try {
        $gitVersion = git --version
        Write-Host "  ✅ Git: $gitVersion" -ForegroundColor Green
    } catch {
        Write-Host "  ❌ Git not found. Please install Git." -ForegroundColor Red
        exit 1
    }
    
    Write-Host ""
}

# Setup function
function Initialize-Deployment {
    Write-Host "🚀 Starting deployment setup..." -ForegroundColor Cyan
    
    # Login to Railway
    Write-Host "`n🔑 Please login to Railway..." -ForegroundColor Yellow
    railway login
    
    # Link project or create new
    Write-Host "`n🔗 Linking to Railway project..." -ForegroundColor Yellow
    $projectList = railway projects 2>&1
    Write-Host $projectList
    
    $linkChoice = Read-Host "`nLink to existing project? (y/n)"
    if ($linkChoice -eq 'y') {
        railway link
    } else {
        Write-Host "`n🆕 Creating new Railway project..." -ForegroundColor Green
        railway init
    }
    
    # Environment variables setup
    Write-Host "`n⚙️  Setting up environment variables..." -ForegroundColor Yellow
    
    Write-Host "`n📊 Database Configuration (Neon):" -ForegroundColor Cyan
    Write-Host "Get your connection string from: https://console.neon.tech" -ForegroundColor Gray
    $dbUrl = Read-Host "Enter DATABASE_URL from Neon"
    
    if ($dbUrl) {
        railway variables set DATABASE_URL="$dbUrl"
    }
    
    Write-Host "`n🔐 Security Configuration:" -ForegroundColor Cyan
    $jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
    Write-Host "Generated JWT_SECRET: $jwtSecret" -ForegroundColor Gray
    railway variables set JWT_SECRET="$jwtSecret"
    
    Write-Host "`n📧 Email Configuration:" -ForegroundColor Cyan
    Write-Host "Options: smtp, gmail, outlook" -ForegroundColor Gray
    $emailProvider = Read-Host "Enter EMAIL_PROVIDER (default: smtp)"
    if (-not $emailProvider) { $emailProvider = "smtp" }
    railway variables set EMAIL_PROVIDER="$emailProvider"
    
    if ($emailProvider -eq "smtp") {
        $smtpHost = Read-Host "Enter SMTP_HOST (e.g., smtp.gmail.com)"
        $smtpUser = Read-Host "Enter SMTP_USER (your email)"
        $smtpPass = Read-Host "Enter SMTP_PASS (app password)" -AsSecureString
        $smtpPassPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($smtpPass))
        $fromName = Read-Host "Enter EMAIL_FROM_NAME"
        
        railway variables set SMTP_HOST="$smtpHost"
        railway variables set SMTP_PORT="587"
        railway variables set SMTP_SECURE="false"
        railway variables set SMTP_USER="$smtpUser"
        railway variables set SMTP_PASS="$smtpPassPlain"
        railway variables set EMAIL_FROM_NAME="$fromName"
        railway variables set EMAIL_FROM_ADDRESS="$smtpUser"
    }
    
    # Core variables
    railway variables set NODE_ENV="production"
    railway variables set PORT="3001"
    
    Write-Host "`n✅ Environment variables configured!" -ForegroundColor Green
}

# Deploy function
function Start-Deployment {
    Write-Host "`n🚀 Deploying to Railway..." -ForegroundColor Cyan
    
    if (-not $SkipBuild) {
        Write-Host "`n📦 Building application..." -ForegroundColor Yellow
        
        # Build frontend
        Write-Host "Building frontend..." -ForegroundColor Gray
        Set-Location frontend
        npm run build
        Set-Location ..
        
        # Build backend
        Write-Host "Building backend..." -ForegroundColor Gray
        Set-Location backend
        npm run build
        Set-Location ..
    }
    
    # Deploy to Railway
    Write-Host "`n☁️  Uploading to Railway..." -ForegroundColor Yellow
    railway up
    
    # Run database migrations
    Write-Host "`n🗄️  Running database migrations..." -ForegroundColor Yellow
    railway run -- npx prisma migrate deploy
    
    # Get deployment URL
    Write-Host "`n🔗 Getting deployment URL..." -ForegroundColor Yellow
    $url = railway environment 2>&1 | Select-String "Deployed at" | ForEach-Object { $_ -replace ".*Deployed at: ", "" }
    
    Write-Host "`n✅ Deployment Complete!" -ForegroundColor Green
    Write-Host "🌐 Your app is live at: $url" -ForegroundColor Cyan
    Write-Host "💡 Don't forget to run seed data if this is your first deployment!" -ForegroundColor Yellow
}

# Main execution
Test-Prerequisites

if ($SetupOnly) {
    Initialize-Deployment
} else {
    $setup = Read-Host "`nRun setup first? (recommended for first deploy) (y/n)"
    if ($setup -eq 'y') {
        Initialize-Deployment
    }
    Start-Deployment
}

Write-Host "`n📚 Next steps:" -ForegroundColor Cyan
Write-Host "  1. Visit your Railway dashboard to monitor deployment" -ForegroundColor White
Write-Host "  2. Check logs: railway logs" -ForegroundColor White
Write-Host "  3. Open app: railway open" -ForegroundColor White
Write-Host "  4. Run seeds: railway run npx prisma db seed" -ForegroundColor White
