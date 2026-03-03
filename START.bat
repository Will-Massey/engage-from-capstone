@echo off
echo ======================================
echo Engage by Capstone - Start Script
echo ======================================
echo.

echo Starting Backend Server...
start "Backend Server" cmd /k "cd backend && npm run dev"

echo Starting Frontend Server...
start "Frontend Server" cmd /k "cd frontend && npm run dev"

echo.
echo ======================================
echo Servers Started!
echo ======================================
echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:3001
echo.
echo Demo Login:
echo Email: admin@demo.practice
echo Password: DemoPass123!
echo.
pause
