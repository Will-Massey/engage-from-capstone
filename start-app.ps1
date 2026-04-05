#!/usr/bin/env pwsh
# Quick Start - Engage by Capstone
# Starts both backend and frontend locally

param(
    [switch]$SkipBackend,
    [switch]$SkipFrontend,
    [switch]$Setup
)

$ErrorActionPreference = "Stop"

Write-Host @"
╔══════════════════════════════════════════════════════════════╗
║           Engage by Capstone - Quick Start                   ║
╚════════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

# Setup mode - install dependencies
if ($Setup) {
    Write-Host "`n📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
    cd backend; npm install; cd ..
    cd frontend; npm install; cd ..
    Write-Host "✅ Dependencies installed!" -ForegroundColor Green
    return
}

# Function to check if a port is in use
function Test-PortInUse {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $connection
}

# Check environment files
if (-not (Test-Path "backend/.env")) {
    Write-Host "`n⚠️  backend/.env not found!" -ForegroundColor Red
    Write-Host "Creating from example..." -ForegroundColor Yellow
    Copy-Item "backend/.env.example" "backend/.env"
    Write-Host "Please edit backend/.env with your database credentials" -ForegroundColor Yellow
}

# Kill existing processes on ports
Write-Host "`n🧹 Cleaning up existing processes..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start Backend
if (-not $SkipBackend) {
    Write-Host "`n🚀 Starting Backend (http://localhost:3001)..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-Command", "cd '$PWD/backend'; npm run dev" -WindowStyle Normal
    Start-Sleep -Seconds 5
    Write-Host "   Backend starting... wait for 'running on port 3001' message" -ForegroundColor Gray
}

# Start Frontend
if (-not $SkipFrontend) {
    Write-Host "`n🚀 Starting Frontend (http://localhost:5173)..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-Command", "cd '$PWD/frontend'; npm run dev" -WindowStyle Normal
    Start-Sleep -Seconds 3
    Write-Host "   Frontend starting..." -ForegroundColor Gray
}

Write-Host @"

✅ App is starting!

📍 URLs:
   Frontend: http://localhost:5173
   Backend:  http://localhost:3001
   API Docs: http://localhost:3001/api/status

🔑 Demo Login:
   Email: admin@demo.practice
   Password: DemoPass123!

⚠️  First time? Run: .\start-app.ps1 -Setup

Press Ctrl+C in each window to stop.
"@ -ForegroundColor Cyan
