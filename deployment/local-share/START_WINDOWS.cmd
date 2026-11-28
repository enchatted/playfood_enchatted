@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22-26 from https://nodejs.org/ and run this again.
  pause
  exit /b 1
)
node start-local.mjs
pause
