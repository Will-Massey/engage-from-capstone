# Engage - Quick Deploy to Render (PowerShell)
# Usage: .\scripts\deploy.ps1 [backend|frontend|all|status]

param(
    [Parameter()]
    [ValidateSet("backend", "frontend", "all", "status", "b", "f", "a", "s")]
    [string]$Target = "all"
)

# Colors
$Green = "`e[32m"
$Blue = "`e[34m"
$Yellow = "`e[33m"
$Red = "`e[31m"
$Reset = "`e[0m"

# Service IDs (get these from Render dashboard)
$BackendServiceId = $env:RENDER_BACKEND_SERVICE_ID
$FrontendServiceId = $env:RENDER_FRONTEND_SERVICE_ID
$ApiKey = $env:RENDER_API_KEY

if (-not $ApiKey) {
    Write-Host "${Red}Error: RENDER_API_KEY not set${Reset}" -ForegroundColor Red
    Write-Host "Get your API key from: https://dashboard.render.com/settings/api-keys"
    Write-Host "Then run: `$env:RENDER_API_KEY = 'your_key_here'"
    exit 1
}

# Map short aliases
switch ($Target) {
    "b" { $Target = "backend" }
    "f" { $Target = "frontend" }
    "a" { $Target = "all" }
    "s" { $Target = "status" }
}

function Deploy-Service {
    param($ServiceId, $ServiceName, $ClearCache)
    
    Write-Host "${Blue}🚀 Deploying $ServiceName...${Reset}" -ForegroundColor Cyan
    
    $body = @{ clearCache = $ClearCache } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$ServiceId/deploys" `
            -Method POST `
            -Headers @{ "Authorization" = "Bearer $ApiKey"; "Content-Type" = "application/json" } `
            -Body $body
        
        Write-Host "${Green}✅ $ServiceName deploy triggered${Reset}" -ForegroundColor Green
        Write-Host "   Deploy ID: $($response.id)"
        Write-Host "   Monitor: https://dashboard.render.com/web/$ServiceId/events"
    }
    catch {
        Write-Host "${Red}❌ Failed to deploy $ServiceName${Reset}" -ForegroundColor Red
        Write-Host "   Error: $_"
    }
}

function Check-Status {
    param($ServiceId, $ServiceName)
    
    Write-Host "${Blue}📊 Checking $ServiceName status...${Reset}" -ForegroundColor Cyan
    
    try {
        $response = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$ServiceId" `
            -Headers @{ "Authorization" = "Bearer $ApiKey" }
        
        Write-Host "   Status: ${Yellow}$($response.status)${Reset}"
        Write-Host "   URL: $($response.url)"
    }
    catch {
        Write-Host "   Error checking status: $_"
    }
}

# Main
Write-Host "========================================"
Write-Host "   ENGAGE - RENDER DEPLOY"
Write-Host "========================================"
Write-Host ""

switch ($Target) {
    "backend" {
        Deploy-Service $BackendServiceId "Backend" $false
    }
    "frontend" {
        Deploy-Service $FrontendServiceId "Frontend" $true
    }
    "status" {
        Check-Status $BackendServiceId "Backend"
        Check-Status $FrontendServiceId "Frontend"
    }
    "all" {
        Deploy-Service $BackendServiceId "Backend" $false
        Write-Host ""
        Start-Sleep -Seconds 2
        Deploy-Service $FrontendServiceId "Frontend" $true
        Write-Host ""
        Write-Host "${Green}🎉 All deployments triggered!${Reset}" -ForegroundColor Green
        Write-Host ""
        Write-Host "Monitor progress:"
        Write-Host "  Backend:  https://dashboard.render.com/web/$BackendServiceId/events"
        Write-Host "  Frontend: https://dashboard.render.com/static/$FrontendServiceId/events"
    }
}

Write-Host ""
