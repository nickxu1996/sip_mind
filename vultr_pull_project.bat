@echo off
setlocal

rem Fill these values before first use.
set "VULTR_USER=root"
set "VULTR_HOST=YOUR_VULTR_IP"
set "PROJECT_DIR=/opt/sip-mind"
set "REPO_URL=https://github.com/YOUR_NAME/05_sip_mind.git"
set "BRANCH=master"

if "%VULTR_HOST%"=="YOUR_VULTR_IP" (
  echo Please edit vultr_pull_project.bat first:
  echo   VULTR_HOST, VULTR_USER, REPO_URL, PROJECT_DIR, BRANCH
  pause
  exit /b 1
)

ssh -o ServerAliveInterval=30 "%VULTR_USER%@%VULTR_HOST%" "set -e; if [ ! -d '%PROJECT_DIR%/.git' ]; then mkdir -p '%PROJECT_DIR%'; git clone --branch '%BRANCH%' '%REPO_URL%' '%PROJECT_DIR%'; else cd '%PROJECT_DIR%'; git fetch origin '%BRANCH%'; git checkout '%BRANCH%'; git pull --ff-only origin '%BRANCH%'; fi; cd '%PROJECT_DIR%'; if [ -f package-lock.json ]; then npm ci; npm run build; fi"

if errorlevel 1 (
  echo Vultr pull failed.
  pause
  exit /b 1
)

echo Vultr pull finished.
pause
