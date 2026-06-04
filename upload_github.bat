@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

set "REPO_URL=https://github.com/nickxu1996/sip_mind.git"
set "BRANCH=master"

echo.
echo [Sip Mind] One-click GitHub upload
echo Repo: %REPO_URL%

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

for /f "usebackq delims=" %%b in (`git branch --show-current`) do set "CURRENT_BRANCH=%%b"
if not "%CURRENT_BRANCH%"=="" set "BRANCH=%CURRENT_BRANCH%"
if "%CURRENT_BRANCH%"=="" git checkout -b %BRANCH%

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin "%REPO_URL%"
) else (
  git remote set-url origin "%REPO_URL%"
)

echo.
echo [Sip Mind] Running checks before upload...
call npm test
if errorlevel 1 (
  echo Tests failed. Upload cancelled.
  pause
  exit /b 1
)

call npm run build
if errorlevel 1 (
  echo Build failed. Upload cancelled.
  pause
  exit /b 1
)

echo.
echo [Sip Mind] Staging safe project files...
git add -A

git diff --cached --quiet
if not errorlevel 1 (
  echo Nothing new to commit.
) else (
  set "COMMIT_MESSAGE=%~2"
  if "!COMMIT_MESSAGE!"=="" set "COMMIT_MESSAGE=Update Sip Mind"
  git commit -m "!COMMIT_MESSAGE!"
  if errorlevel 1 (
    echo Commit failed. Upload cancelled.
    pause
    exit /b 1
  )
)

echo.
echo [Sip Mind] Pushing to GitHub...
git push -u origin %BRANCH%
if errorlevel 1 (
  echo Push failed. Check GitHub login, repo URL, and permissions.
  pause
  exit /b 1
)

echo.
echo Upload finished successfully.
echo Repo: %REPO_URL%
echo Branch: %BRANCH%
pause
