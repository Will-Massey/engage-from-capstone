@echo off
echo 🧹 Resetting Servers...
echo =====================
echo.

echo Stopping all Node processes...
taskkill /F /IM node.exe 2>nul

echo.
echo Waiting for ports to clear...
timeout /t 3 /nobreak >nul

echo.
echo Checking ports...
netstat -ano | findstr :3001
netstat -ano | findstr :5173

echo.
echo ✅ All servers stopped. You can now run start-dev.bat
echo.
pause
