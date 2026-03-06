@echo off
echo 🏗️ Building Engage by Capstone for Production
echo =============================================
echo.

REM Install dependencies
echo 📦 Installing dependencies...
call npm ci
cd backend
call npm ci
cd ..

REM Generate Prisma client
echo 🔄 Generating Prisma client...
cd backend
call npx prisma generate
cd ..

REM Build Backend
echo 🔨 Building Backend...
cd backend
call npx tsc --noEmitOnError false
cd ..

REM Build Frontend
echo 🎨 Building Frontend...
cd frontend
call npm run build
cd ..

echo.
echo ✅ Build Complete!
echo.
echo Outputs:
echo   - Backend: backend/dist/
echo   - Frontend: frontend/dist/
echo.
pause
