@echo off
echo Starting Engage by Capstone Development Servers...
echo.

REM Start backend in a new window
echo Starting Backend Server...
start "Backend Server" cmd /k "cd backend && npm run dev"

REM Wait a moment
timeout /t 2 /nobreak > nul

REM Start frontend in a new window
echo Starting Frontend Server...
start "Frontend Server" cmd /k "cd frontend && npm run dev"

echo.
echo Both servers are starting in separate windows...
echo Backend will be available at: http://localhost:3001
echo Frontend will be available at: http://localhost:5173
echo.
pause
