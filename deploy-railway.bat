@echo off
chcp 65001 >nul
echo 🚀 Engage by Capstone - Railway Deployment
echo =========================================
echo.

REM Check if Railway CLI is installed
where railway >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Railway CLI not found. Installing...
    npm install -g @railway/cli
)

echo 📋 Checking prerequisites...
echo ✅ Railway CLI found

REM Login to Railway
echo.
echo 🔑 Logging into Railway...
railway login

REM Check if project is initialized
if not exist .railway\config.json (
    echo 📦 Initializing Railway project...
    railway init
) else (
    echo 📦 Using existing Railway project
)

echo.
echo 🗄️ IMPORTANT: Make sure PostgreSQL is added in Railway Dashboard!
echo    Railway Dashboard → New → Database → PostgreSQL
echo.
pause

echo.
echo 🚀 Deploying to Railway...
railway up

echo.
echo ✅ Deployment complete!
echo.
echo Next steps:
echo 1. Check Railway Dashboard for deployment status
echo 2. Set environment variables (JWT_SECRET, STRIPE keys)
echo 3. Run migrations: railway run npx prisma migrate deploy
echo 4. Seed database (optional): railway run npx prisma db seed
echo.
pause
