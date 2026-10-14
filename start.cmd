@echo off
rem Predator Monitor — build and launch (double-click). Add "admin" as an argument to start with full sensors.
cd /d "%~dp0"
if not exist node_modules call npm install
call node build.mjs >nul
if /i "%1"=="admin" (
  powershell -NoProfile -Command "Start-Process -FilePath '%~dp0node_modules\electron\dist\electron.exe' -ArgumentList '\"%~dp0.\"' -Verb RunAs"
) else (
  start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
)
