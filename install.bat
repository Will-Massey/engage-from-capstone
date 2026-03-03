@echo off
echo =========================================
echo Engage by Capstone - Install
echo =========================================
echo.

REM Check if npm is available
where npm >nul 2>nul
if errorlevel 1 (
    echo ERROR: npm not found. Please install Node.js first.
    pause
    exit /b 1
)

REM Install shared
echo Installing shared package...
cd "%~dp0shared"
call npm install
if errorlevel 1 (
    echo Failed to install shared package
    pause
    exit /b 1
)

REM Install backend
echo Installing backend...
cd "%~dp0backend"
call npm install
if errorlevel 1 (
    echo Failed to install backend
    pause
    exit /b 1
)

REM Install frontend
echo Installing frontend...
cd "%~dp0frontend"
call npm install
if errorlevel 1 (
    echo Failed to install frontend
    pause
    exit /b 1
)

cd "%~dp0"

echo.
echo =========================================
echo Installation Complete!
echo =========================================
echo.
echo Next steps:
echo 1. Make sure PostgreSQL is running
echo 2. Create database 'uk_proposals'
echo 3. Run: cd backend
echo 4. Run: npx prisma migrate dev
echo 5. Run: npx prisma db seed
echo 6. Run: ..\start-dev.bat
echo.
pause
