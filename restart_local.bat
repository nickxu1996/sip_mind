@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo [Hermes] Local Service Restart Helper
echo ------------------------------------------

:: Load ports from .env if available
set API_PORT=8787
set FE_PORT=5173

if exist .env (
    for /f "tokens=1,2 delims==" %%a in (.env) do (
        if "%%a"=="PORT" set API_PORT=%%b
    )
)

echo Checking for existing processes on ports !API_PORT! (API) and !FE_PORT! (Frontend)...

:: Kill process on API_PORT
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :!API_PORT! ^| findstr LISTENING') do (
    echo Terminating API process %%a...
    taskkill /F /PID %%a 2>nul
)

:: Kill process on FE_PORT
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :!FE_PORT! ^| findstr LISTENING') do (
    echo Terminating Frontend process %%a...
    taskkill /F /PID %%a 2>nul
)

:: Kill stray Node processes related to this project (optional safety)
echo Cleaning up stray vite/tsx/node processes...
taskkill /F /IM node.exe /T 2>nul

echo.
echo ------------------------------------------
echo Restarting services in background...
echo ------------------------------------------

:: Use 'start' to run without blocking the BAT window
echo Launching API server...
start /B cmd /c "npm run server:dev"

echo Waiting for API server to become ready...
set API_READY=0
for /L %%i in (1,1,40) do (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:!API_PORT!/api/health -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
    if !errorlevel! equ 0 (
        set API_READY=1
        goto api_ready
    )
    timeout /t 1 /nobreak >nul
)

:api_ready
if "!API_READY!"=="0" (
    echo API did not become ready in time. Frontend will still start, but API requests may retry.
) else (
    echo API server is ready.
)

echo Launching Frontend dev server...
start /B cmd /c "npm run dev"

echo.
echo Success. Services are restarting on:
echo - Frontend: http://127.0.0.1:!FE_PORT!
echo - API:      http://127.0.0.1:!API_PORT!
echo.
pause
