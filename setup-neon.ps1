#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Setup Neon PostgreSQL database for Engage by Capstone
.DESCRIPTION
    Helps create Neon project and configure database for production
#>

param(
    [Parameter()]
    [string]$ProjectName = "engage-production",
    
    [Parameter()]
    [string]$Region = "aws-eu-central-1"
)

$ErrorActionPreference = "Stop"

Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║         Engage by Capstone - Neon Database Setup             ║
╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

Write-Host "`n📋 This script will help you set up Neon PostgreSQL database`n" -ForegroundColor Yellow

Write-Host "Steps:" -ForegroundColor Cyan
Write-Host "  1. Create account at https://neon.tech" -ForegroundColor White
Write-Host "  2. Create a new project in Neon console" -ForegroundColor White
Write-Host "  3. Get the connection string" -ForegroundColor White
Write-Host "  4. Run migrations to set up schema" -ForegroundColor White

Write-Host "`n────────────────────────────────────────────────────────────`n" -ForegroundColor Gray

# Instructions for Neon
Write-Host "🌐 Neon Console: https://console.neon.tech" -ForegroundColor Cyan
Write-Host "`nRecommended settings:" -ForegroundColor Yellow
Write-Host "  • Project Name: $ProjectName" -ForegroundColor White
Write-Host "  • Region: $Region (Frankfurt - closest to UK)" -ForegroundColor White
Write-Host "  • Database Name: engage_db" -ForegroundColor White

Write-Host "`n────────────────────────────────────────────────────────────`n" -ForegroundColor Gray

# Wait for user to create Neon project
Write-Host "Please create your Neon project and paste the connection string below." -ForegroundColor Yellow
Write-Host "(Find it in Neon Dashboard → Connection Details → Connection string)`n" -ForegroundColor Gray

$connectionString = Read-Host "Enter DATABASE_URL"

if (-not $connectionString) {
    Write-Host "❌ No connection string provided. Exiting." -ForegroundColor Red
    exit 1
}

# Validate connection string format
if (-not ($connectionString -match "^postgresql://")) {
    Write-Host "❌ Invalid connection string. Must start with 'postgresql://'" -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ Connection string received!" -ForegroundColor Green

# Test connection
Write-Host "`n🧪 Testing database connection..." -ForegroundColor Yellow

$env:DATABASE_URL = $connectionString

try {
    Set-Location backend
    
    # Test with Prisma
    Write-Host "  Connecting to database..." -ForegroundColor Gray
    $testResult = npx prisma db execute --stdin 2>&1 <<<'SELECT 1;' 
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Database connection successful!" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Could not verify connection, but will attempt migrations" -ForegroundColor Yellow
    }
    
    # Run migrations
    Write-Host "`n🗄️  Running database migrations..." -ForegroundColor Yellow
    npx prisma migrate deploy
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Migrations applied successfully!" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Migration failed. Please check the error above." -ForegroundColor Red
        Set-Location ..
        exit 1
    }
    
    # Generate Prisma client
    Write-Host "`n🔧 Generating Prisma client..." -ForegroundColor Yellow
    npx prisma generate
    
    Set-Location ..
    
    Write-Host "`n────────────────────────────────────────────────────────────`n" -ForegroundColor Gray
    Write-Host "✅ Database setup complete!" -ForegroundColor Green
    
    Write-Host "`n📋 Summary:" -ForegroundColor Cyan
    Write-Host "  • Database: Connected and migrated" -ForegroundColor White
    Write-Host "  • Schema: All tables created" -ForegroundColor White
    Write-Host "  • Prisma Client: Generated" -ForegroundColor White
    
    Write-Host "`n💾 Save this connection string for Railway deployment:" -ForegroundColor Cyan
    Write-Host $connectionString -ForegroundColor Gray
    
    # Save to file
    $saveFile = Read-Host "`nSave connection string to .env.neon file? (y/n)"
    if ($saveFile -eq 'y') {
        "DATABASE_URL=$connectionString" | Out-File -FilePath ".env.neon" -Encoding UTF8
        Write-Host "  ✅ Saved to .env.neon" -ForegroundColor Green
        Write-Host "  ⚠️  Add .env.neon to .gitignore!" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "`n❌ Error: $_" -ForegroundColor Red
    Set-Location ..
    exit 1
}

Write-Host "`n📚 Next steps:" -ForegroundColor Cyan
Write-Host "  1. Copy the DATABASE_URL to Railway environment variables" -ForegroundColor White
Write-Host "  2. Or run: .\deploy-railway.ps1" -ForegroundColor White
Write-Host "  3. Your database is ready! 🎉" -ForegroundColor White
