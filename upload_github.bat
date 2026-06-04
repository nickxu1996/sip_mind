@echo off
setlocal

cd /d "%~dp0"

set "REPO_URL=%~1"
set "BRANCH=master"

if "%REPO_URL%"=="" (
  echo Please drag this bat into Command Prompt with your GitHub repo URL:
  echo.
  echo   upload_github.bat https://github.com/YOUR_NAME/05_sip_mind.git
  echo.
  echo Or edit this file and set REPO_URL directly.
  pause
  exit /b 1
)

git --version >nul 2>&1
if errorlevel 1 (
  echo Git is not installed or not available in PATH.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  git init
)

git branch --show-current >nul 2>&1
for /f "usebackq delims=" %%b in (`git branch --show-current`) do set "CURRENT_BRANCH=%%b"
if "%CURRENT_BRANCH%"=="" (
  git checkout -b %BRANCH%
) else (
  set "BRANCH=%CURRENT_BRANCH%"
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin "%REPO_URL%"
) else (
  git remote set-url origin "%REPO_URL%"
)

git add -A
git commit -m "Initial Sip Mind project" || echo Nothing new to commit.
git push -u origin %BRANCH%

echo.
echo Upload finished. Branch: %BRANCH%
pause
