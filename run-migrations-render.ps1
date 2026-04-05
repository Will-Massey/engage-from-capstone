#!/usr/bin/env pwsh
# Run database migrations against Render PostgreSQL

param(
    [Parameter(Mandatory=$true)]
    [string]$DatabaseUrl
)

Write-Host "🗄️  Running Prisma Migrations on Render Database..." -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# Set the environment variable
$env:DATABASE_URL = $DatabaseUrl

# Navigate to backend
cd backend

# Generate Prisma client
Write-Host "`n📦 Generating Prisma Client..." -ForegroundColor Yellow
npx prisma generate

# Deploy migrations
Write-Host "`n🚀 Deploying migrations..." -ForegroundColor Yellow
npx prisma migrate deploy

# Optional: Seed data
Write-Host "`n🌱 Seeding database (optional)..." -ForegroundColor Yellow
$seed = Read-Host "Run seed? (y/n)"
if ($seed -eq 'y') {
    npx prisma db seed
}

Write-Host "`n✅ Done!" -ForegroundColor Green
