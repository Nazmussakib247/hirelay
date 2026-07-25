@echo off
setlocal
title HR Recruiting System - Stop
cd /d "%~dp0"

echo ============================================
echo   HR Recruiting System - Stopping...
echo ============================================
echo.

docker compose down
if errorlevel 1 (
    echo [ERROR] Failed to stop containers. Is Docker running?
    pause
    exit /b 1
)

echo.
echo [OK] All services stopped. Data is kept in Docker volumes.
echo      (To wipe ALL data: docker compose down -v)
echo.
pause
