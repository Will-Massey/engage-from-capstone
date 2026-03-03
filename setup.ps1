# Engage by Capstone Setup Script
Write-Host "=========================================" -ForegroundColor Green
Write-Host "Engage by Capstone - Setup Script" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""

# Function to check if a command exists
function Test-CommandExists {
    param($Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

if (-not (Test-CommandExists "node")) {
    Write-Host "ERROR: Node.js is not installed. Please install Node.js 18+ first." -ForegroundColor Red
    exit 1
}

$nodeVersion = (node --version).Substring(1, 2)
if ([int]$nodeVersion -lt 18) {
    Write-Host "ERROR: Node.js version $nodeVersion found. Version 18+ required." -ForegroundColor Red
    exit 1
}

Write-Host "✓ Node.js version: $(node --version)" -ForegroundColor Green

# Check for npm
if (-not (Test-CommandExists "npm")) {
    Write-Host "ERROR: npm is not installed." -ForegroundColor Red
    exit 1
}
Write-Host "✓ npm version: $(npm --version)" -ForegroundColor Green

Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Yellow

# Install shared
Write-Host "Installing shared package..." -ForegroundColor Cyan
Set-Location -Path "$PSScriptRoot\shared"
try {
    npm install
    Write-Host "✓ Shared package installed" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to install shared package" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

# Install backend
Write-Host "Installing backend..." -ForegroundColor Cyan
Set-Location -Path "$PSScriptRoot\backend"
try {
    npm install
    Write-Host "✓ Backend installed" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to install backend" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

# Install frontend
Write-Host "Installing frontend..." -ForegroundColor Cyan
Set-Location -Path "$PSScriptRoot\frontend"
try {
    npm install
    Write-Host "✓ Frontend installed" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to install frontend" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Set-Location -Path $PSScriptRoot

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Make sure PostgreSQL is running"
Write-Host "2. Create a database named 'uk_proposals'"
Write-Host "3. Update backend/.env with your database credentials"
Write-Host "4. Run migrations: cd backend; npx prisma migrate dev"
Write-Host "5. Seed database: cd backend; npx prisma db seed"
Write-Host "6. Start servers: .\start-dev.bat"
Write-Host ""
Write-Host "For detailed instructions, see QUICKSTART.md" -ForegroundColor Cyan
