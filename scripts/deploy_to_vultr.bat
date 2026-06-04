@echo off
setlocal
cd /d "%~dp0.."

echo [Sip Mind] Vultr deployment helper
echo This is a placeholder template. Fill PROJECT_CONFIG.env with private deployment values before use.
echo.
if not exist PROJECT_CONFIG.env (
  echo PROJECT_CONFIG.env not found. Copy PROJECT_CONFIG.example.env to PROJECT_CONFIG.env and fill private values first.
  exit /b 1
)

echo Deployment must be explicitly confirmed by the project owner.
set /p CONFIRM="Deploy to Vultr? Type DEPLOY to continue: "
if /I not "%CONFIRM%"=="DEPLOY" (
  echo Deployment cancelled.
  exit /b 0
)

echo Load deployment values manually or extend this script after PROJECT_CONFIG.env is configured.
echo Expected deployment steps:
echo 1. SSH to VULTR_USER@VULTR_HOST
echo 2. cd VULTR_PROJECT_PATH
echo 3. git pull origin GITHUB_BRANCH
echo 4. npm ci && npm run build
echo 5. systemctl restart SYSTEMD_SERVICE_NAME
echo 6. systemctl status SYSTEMD_SERVICE_NAME
