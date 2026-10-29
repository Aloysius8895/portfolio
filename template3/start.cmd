@echo off
cd /d "%~dp0.."
set NODE_USE_SYSTEM_CA=1
if not exist "node_modules\sharp" (
  echo Installing project dependencies...
  call npm ci
  if errorlevel 1 exit /b 1
)
call npm start
pause
