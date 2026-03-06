@echo off
echo 🚀 Starting Engage by Capstone Development Servers
echo =================================================
echo.

REM Kill any existing Node processes
echo 🧹 Cleaning up existing processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

REM Start Backend
echo 📦 Starting Backend (Port 3001)...
start "Backend Server" cmd /k "cd backend && npm run dev"

REM Wait a moment
timeout /t 3 /nobreak >nul

REM Start Frontend
echo 🎨 Starting Frontend (Port 5173)...
start "Frontend Server" cmd /k "cd frontend && npm run dev"

echo.
echo ✅ Servers starting in new windows...
echo.
echo URLs:
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:3001
echo.
echo Demo Login:
echo   Email: admin@demo.practice
echo   Password: DemoPass123!
echo.
pause
