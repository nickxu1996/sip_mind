@echo off
setlocal
cd /d "%~dp0.."

echo [Sip Mind] Server restart helper
echo This placeholder requires PROJECT_CONFIG.env and SSH configuration before use.
echo Do not put passwords or private keys in this script.
set /p CONFIRM="Restart remote service? Type RESTART to continue: "
if /I not "%CONFIRM%"=="RESTART" (
  echo Restart cancelled.
  exit /b 0
)

echo TODO: Configure SSH command using VULTR_HOST, VULTR_USER, and SYSTEMD_SERVICE_NAME from PROJECT_CONFIG.env.
