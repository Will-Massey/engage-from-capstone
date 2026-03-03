@echo off
echo ======================================
echo Engage by Capstone - Setup Script
echo ======================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed. Please install Node.js 18+ first.
    echo Download from: https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo.

REM Install root dependencies
echo Installing root dependencies...
call npm install --legacy-peer-deps
if errorlevel 1 (
    echo Retrying with different settings...
    call npm install --force
)

REM Install backend dependencies
echo.
echo Installing backend dependencies...
cd backend
call npm install --legacy-peer-deps
if errorlevel 1 (
    call npm install --force
)

REM Install frontend dependencies
echo.
echo Installing frontend dependencies...
cd ..\frontend
call npm install --legacy-peer-deps
if errorlevel 1 (
    call npm install --force
)

REM Install shared dependencies
echo.
echo Installing shared dependencies...
cd ..\shared
call npm install --legacy-peer-deps
if errorlevel 1 (
    call npm install --force
)

cd ..

echo.
echo ======================================
echo Installation Complete!
echo ======================================
echo.
echo Next steps:
echo 1. Setup your database in backend/.env file
echo 2. Run: npm run db:migrate
echo 3. Run: npm run db:seed
echo 4. Run: npm run dev
echo.
pause
