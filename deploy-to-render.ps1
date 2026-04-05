# Engage - Deploy to Render Script (PowerShell)
# Run this script to push code and deploy to Render

Write-Host "🚀 Engage Deployment Script" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "render.yaml")) {
    Write-Host "Error: render.yaml not found. Are you in the engage directory?" -ForegroundColor Red
    exit 1
}

Write-Host "Step 1: Checking git status..." -ForegroundColor Blue
git status --short

Write-Host ""
Write-Host "Step 2: Adding all changes..." -ForegroundColor Blue
git add -A

Write-Host ""
Write-Host "Step 3: Committing changes..." -ForegroundColor Blue
git commit -m "fix: Finalize app - real dashboard data, service detail page, cover letter flow`

Changes made:`
- Added dashboard stats API endpoint with real data`
- Replaced mock chart data with live API integration`
- Completely rebuilt Service Detail page with full functionality`
- Verified cover letter flow working correctly`
- Updated API client with getDashboardStats method`

Ready for production deployment."

Write-Host ""
Write-Host "Step 4: Pushing to GitHub..." -ForegroundColor Blue
git push origin master

Write-Host ""
Write-Host "✅ Code pushed to GitHub!" -ForegroundColor Green
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Go to Render Dashboard:"
Write-Host "   https://dashboard.render.com" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Click 'New' → 'Blueprint'"
Write-Host "   OR use the quick deploy button:"
Write-Host "   https://dashboard.render.com/select-repo?type=blueprint" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. Select your repository: Will-Massey/engage-from-capstone"
Write-Host ""
Write-Host "4. Render will automatically:"
Write-Host "   • Create PostgreSQL database"
Write-Host "   • Deploy backend API"
Write-Host "   • Deploy frontend static site"
Write-Host "   • Configure environment variables"
Write-Host ""
Write-Host "5. After deployment, set these environment variables in Render Dashboard:"
Write-Host ""
Write-Host "   Backend (engage-backend):" -ForegroundColor Cyan
Write-Host "   - JWT_SECRET: (generate with: [System.Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 })))"
Write-Host "   - SMTP_USER: william@capstonesoftware.co.uk"
Write-Host "   - SMTP_PASS: [your SMTP password]"
Write-Host "   - COMPANIES_HOUSE_API_KEY: [your API key]"
Write-Host "   - STRIPE_SECRET_KEY: [your Stripe key]"
Write-Host ""
Write-Host "6. Run database migrations:"
Write-Host "   Go to engage-backend → Shell → Run: npx prisma migrate deploy"
Write-Host ""
Write-Host "7. Your app will be live at:"
Write-Host "   Frontend: https://engage-frontend-xxx.onrender.com" -ForegroundColor Cyan
Write-Host "   Backend:  https://engage-backend-xxx.onrender.com" -ForegroundColor Cyan
Write-Host ""

# Check for uncommitted changes
$status = git status --porcelain
if ($status) {
    Write-Host "⚠️  Warning: There are uncommitted changes" -ForegroundColor Yellow
    git status --short
}

Write-Host ""
Write-Host "🎉 Deployment preparation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
