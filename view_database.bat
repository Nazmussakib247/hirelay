@echo off
setlocal enabledelayedexpansion
title HR Recruiting System - View Database
cd /d "%~dp0"

echo ============================================
echo   HR Recruiting System - Database Viewer
echo ============================================
echo.

REM -- 1. Make sure the db container is up --------------------------------
docker inspect -f "{{.State.Running}}" hr_db >nul 2>&1
if errorlevel 1 (
    echo [ERROR] hr_db container not found. Run start.bat first.
    echo.
    pause
    exit /b 1
)

REM -- 2. List all tables ----------------------------------------------------
echo [INFO] Tables in database:
echo.
docker exec hr_db psql -U hruser -d hrdb -c "\dt"
echo.

REM -- 3. Dump every row of every table (expanded format, easy to read) -------
echo ============================================
echo   Full contents of every table
echo ============================================

for /f "usebackq delims=" %%T in (`docker exec hr_db psql -U hruser -d hrdb -t -A -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"`) do (
    set "TBL=%%T"
    setlocal
    for /f "delims=" %%C in ("!TBL!") do (
        endlocal
        echo.
        echo ==================== TABLE: %%C ====================
        if /I "%%C"=="cv_files" (
            docker exec hr_db psql -U hruser -d hrdb -x -c "SELECT candidate_id, filename, content_type, uploaded_at, length(content) AS content_size_bytes FROM cv_files;"
        ) else if /I "%%C"=="users" (
            docker exec hr_db psql -U hruser -d hrdb -x -c "SELECT id, username, email, role, is_active, full_name, phone, job_title, department, created_at, last_login FROM users;"
        ) else (
            docker exec hr_db psql -U hruser -d hrdb -x -c "SELECT * FROM %%C;"
        )
    )
)

echo.
echo ============================================
echo   Done. Press any key to close.
echo ============================================
pause >nul
