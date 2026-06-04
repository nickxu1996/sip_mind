@echo off
setlocal
cd /d "%~dp0.."

echo [Sip Mind] Server logs helper
echo This placeholder requires PROJECT_CONFIG.env and SSH configuration before use.
echo Do not put passwords or private keys in this script.
set /p CONFIRM="Show remote service logs? Type LOGS to continue: "
if /I not "%CONFIRM%"=="LOGS" (
  echo Logs cancelled.
  exit /b 0
)

echo TODO: Configure SSH command to run journalctl -u SYSTEMD_SERVICE_NAME -n 100 --no-pager on the server.
