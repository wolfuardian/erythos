@echo off
chcp 65001 >nul
title [Erythos]
cd /d "%~dp0\.."

:: Kill any existing Vite dev server on port 3000
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%p /F >nul 2>&1
)

echo Starting Erythos...
npm run dev -- --open
pause
