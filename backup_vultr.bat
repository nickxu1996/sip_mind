@echo off
setlocal

cd /d "%~dp0"

set "SSH_KEY=%USERPROFILE%\.ssh\id_ed25519_vultr"
set "VULTR_HOST=45.32.52.35"
set "VULTR_USER=root"
set "REMOTE_SCRIPT=/tmp/sip_mind_backup.sh"

if not exist "%SSH_KEY%" (
  echo SSH key not found: %SSH_KEY%
  pause
  exit /b 1
)

echo.
echo [Sip Mind] Copying backup script to Vultr...
scp -i "%SSH_KEY%" -o ServerAliveInterval=30 "%~dp0vultr_remote_backup.sh" "%VULTR_USER%@%VULTR_HOST%:%REMOTE_SCRIPT%"
if errorlevel 1 (
  echo Failed to copy backup script.
  pause
  exit /b 1
)

echo.
echo [Sip Mind] Creating remote backup...
ssh -i "%SSH_KEY%" -o ServerAliveInterval=30 "%VULTR_USER%@%VULTR_HOST%" "chmod 700 %REMOTE_SCRIPT% && bash %REMOTE_SCRIPT%"
if errorlevel 1 (
  echo Backup failed.
  pause
  exit /b 1
)

echo.
echo Backup finished. Archives are stored on Vultr in /opt/sip_mind_backups.
pause
