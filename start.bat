@echo off
setlocal
title HR Recruiting System - Start
cd /d "%~dp0"

echo ============================================
echo   HR Recruiting System - Starting...
echo ============================================
echo.

REM -- 1. Check Docker is installed and running -------------------------------
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running.
    echo         Please start Docker Desktop first, then run start.bat again.
    echo.
    pause
    exit /b 1
)

REM -- 2. Create .env from template on first run ------------------------------
if not exist ".env" (
    echo [INFO] .env not found - creating from .env.example
    copy /y ".env.example" ".env" >nul
)

REM -- 3. Build and start all services ----------------------------------------
echo [INFO] Building and starting containers (first run may take a few minutes)...
docker compose up -d --build
if errorlevel 1 (
    echo.
    echo [ERROR] docker compose failed. See output above.
    pause
    exit /b 1
)

REM -- 4. Wait for backend health ----------------------------------------------
echo.
echo [INFO] Waiting for backend to become healthy...
set RETRIES=0
:waitloop
set /a RETRIES+=1
curl -s -o nul http://localhost:8000/health && goto ready
if %RETRIES% geq 30 (
    echo [WARN] Backend not responding yet - it may still be starting.
    echo        Check logs with:  docker compose logs -f backend
    goto urls
)
timeout /t 2 /nobreak >nul
goto waitloop

:ready
echo [OK] Backend is healthy.

:urls
echo.
echo ============================================
echo   All services started!
echo.
echo   Frontend:   http://localhost:3000
echo   Backend:    http://localhost:8000/docs
echo   n8n:        http://localhost:5678
echo   PostgreSQL: localhost:5432
echo ============================================
echo.
start "" http://localhost:3000
pause
