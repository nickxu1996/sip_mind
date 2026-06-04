@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0.."

echo [Sip Mind] Safe GitHub upload helper
echo.
git status

echo.
echo This script will commit local safe files only after you review git status.
echo It will ask again before pushing.
echo.
set /p COMMIT_MESSAGE="Enter commit message, or leave blank to cancel: "
if "%COMMIT_MESSAGE%"=="" (
  echo Cancelled.
  exit /b 0
)

echo.
echo Staging safe files...
git add .gitignore README.md PROJECT_BRIEF.md REQUIREMENTS_INBOX.md PROJECT_PROFILE.md HERMES_WORKFLOWS.md PROJECT_CONFIG.example.env package.json package-lock.json tsconfig.json vite.config.ts index.html src tests scripts

echo.
echo Staged files:
git diff --cached --name-only

echo.
echo WARNING: confirm that no secrets, .env files, database files, node_modules, or dist files are staged.
set /p CONFIRM_COMMIT="Commit these files? Type YES to continue: "
if /I not "%CONFIRM_COMMIT%"=="YES" (
  echo Commit cancelled.
  exit /b 0
)

git commit -m "%COMMIT_MESSAGE%"
if errorlevel 1 exit /b %errorlevel%

echo.
set /p CONFIRM_PUSH="Push to remote? Type PUSH to continue: "
if /I not "%CONFIRM_PUSH%"=="PUSH" (
  echo Push skipped. Local commit remains available.
  exit /b 0
)

git push
