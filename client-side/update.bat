@echo off
setlocal enabledelayedexpansion

title TestForge Updater v1.1.0

echo.
echo ============================================================
echo           TESTFORGE UPDATER
echo           Version 1.1.0
echo           Lifetime Offline Edition
echo ============================================================
echo.

:: ─── DOCKER CHECK ─────────────────────────────────────────────

docker --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed!
    echo.
    pause
    exit /b 1
)

docker info > nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not running!
    echo.
    pause
    exit /b 1
)

echo [OK] Docker is installed and running
echo.

:: ─── COMPOSE CHECK ────────────────────────────────────────────

docker compose version > nul 2>&1
if %errorlevel% equ 0 (
    set COMPOSE_CMD=docker compose
) else (
    docker-compose --version > nul 2>&1
    if %errorlevel% equ 0 (
        set COMPOSE_CMD=docker-compose
    ) else (
        echo [ERROR] Docker Compose is not installed!
        pause
        exit /b 1
    )
)

echo [OK] Using: %COMPOSE_CMD%
echo.

:: ─── CREATE BACKUP ────────────────────────────────────────────

echo Creating database backup...
set BACKUP_FILE=backup_%DATE:~10,4%%DATE:~4,2%%DATE:~7,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%.sql
set BACKUP_FILE=%BACKUP_FILE: =0%

%COMPOSE_CMD% exec postgres pg_dump -U testforge testforge > %BACKUP_FILE% 2> nul

if %errorlevel% equ 0 (
    echo [OK] Backup saved to %BACKUP_FILE%
) else (
    echo [WARNING] Backup failed, continuing anyway...
)
echo.

:: ─── PULL LATEST ──────────────────────────────────────────────

echo Pulling latest images...
%COMPOSE_CMD% pull
echo.

:: ─── STOP FRONTEND & BACKEND ─────────────────────────────────

echo Stopping frontend and backend...
%COMPOSE_CMD% stop frontend backend
echo.

:: ─── WAIT FOR POSTGRES ────────────────────────────────────────

echo Waiting for PostgreSQL...

set MAX_ATTEMPTS=30
set ATTEMPT=0

:wait_loop
set /a ATTEMPT+=1
%COMPOSE_CMD% exec postgres pg_isready -U testforge > nul 2>&1
if %errorlevel% equ 0 goto postgres_ready

if %ATTEMPT% geq %MAX_ATTEMPTS% (
    echo [ERROR] PostgreSQL is not ready.
    pause
    exit /b 1
)

echo Waiting for PostgreSQL... (attempt !ATTEMPT! of %MAX_ATTEMPTS%)
timeout /t 2 /nobreak > nul
goto wait_loop

:postgres_ready
echo [OK] PostgreSQL is ready!
echo.

:: ─── RUN MIGRATION ────────────────────────────────────────────

echo.
echo ============================================================
echo           RUNNING DATABASE MIGRATION
echo ============================================================
echo.

%COMPOSE_CMD% run --rm migrate

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Database migration failed!
    echo.
    echo To rollback, restore backup:
    echo   %COMPOSE_CMD% exec -T postgres psql -U testforge ^< %BACKUP_FILE%
    echo.
    pause
    exit /b 1
)

echo.
echo [OK] Database migration successful!
echo.

:: ─── START SERVICES ───────────────────────────────────────────

echo Starting updated services...
%COMPOSE_CMD% up -d backend frontend

echo.
echo Waiting for services to be ready...
timeout /t 5 /nobreak > nul

:: ─── CLEAN UP OLD IMAGES ──────────────────────────────────────

echo Cleaning up old images...
docker image prune -f

:: ─── VERIFY ────────────────────────────────────────────────────

echo.
echo ============================================================
echo                    UPDATE COMPLETE
echo ============================================================
echo.
echo  TestForge has been updated!
echo.
echo  Frontend:  http://localhost:4937
echo  Backend:   http://localhost:4936
echo  Database:  localhost:4935
echo.
echo  Backup saved to: %BACKUP_FILE%
echo.
echo ============================================================
echo.
pause