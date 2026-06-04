@echo off
setlocal
cd /d "%~dp0.."

echo [Sip Mind] Pull latest from GitHub
echo.
git branch --show-current
git status

echo.
echo If there are uncommitted changes, cancel now and commit or stash them first.
set /p CONFIRM="Run git pull? Type PULL to continue: "
if /I not "%CONFIRM%"=="PULL" (
  echo Pull cancelled.
  exit /b 0
)

git pull
