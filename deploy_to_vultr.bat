@echo off
setlocal

cd /d "%~dp0"

set "SSH_KEY=%USERPROFILE%\.ssh\id_ed25519_vultr"
set "VULTR_HOST=45.32.52.35"
set "VULTR_USER=root"
set "REMOTE_SCRIPT=/tmp/sip_mind_deploy.sh"
set "REMOTE_ENV=/tmp/sip_mind.env"

if not exist "%SSH_KEY%" (
  echo SSH key not found: %SSH_KEY%
  pause
  exit /b 1
)

if not exist ".env" (
  echo .env not found. Create local .env before deploying.
  pause
  exit /b 1
)

echo.
echo [Sip Mind] Uploading latest code to GitHub first...
call "%~dp0upload_github.bat"
if errorlevel 1 (
  echo GitHub upload failed. Deploy cancelled.
  pause
  exit /b 1
)

echo.
echo [Sip Mind] Copying deploy script and private .env to Vultr...
scp -i "%SSH_KEY%" -o ServerAliveInterval=30 "%~dp0vultr_remote_deploy.sh" "%VULTR_USER%@%VULTR_HOST%:%REMOTE_SCRIPT%"
if errorlevel 1 (
  echo Failed to copy deploy script.
  pause
  exit /b 1
)

scp -i "%SSH_KEY%" -o ServerAliveInterval=30 "%~dp0.env" "%VULTR_USER%@%VULTR_HOST%:%REMOTE_ENV%"
if errorlevel 1 (
  echo Failed to copy .env.
  pause
  exit /b 1
)

echo.
echo [Sip Mind] Running remote Vultr deployment...
ssh -i "%SSH_KEY%" -o ServerAliveInterval=30 "%VULTR_USER%@%VULTR_HOST%" "chmod 700 %REMOTE_SCRIPT% && bash %REMOTE_SCRIPT%"
if errorlevel 1 (
  echo Vultr deployment failed.
  pause
  exit /b 1
)

echo.
echo Vultr deployment finished.
echo Open: http://%VULTR_HOST%
pause
