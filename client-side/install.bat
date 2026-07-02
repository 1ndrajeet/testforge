@echo off
setlocal enabledelayedexpansion

title TestForge Installer v1.0.0

echo.
echo ============================================================
echo           TESTFORGE INSTALLER
echo           Version 1.0.0
echo           Lifetime Offline Edition
echo ============================================================
echo.

:: ─── DOCKER CHECK ─────────────────────────────────────────────

docker --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed!
    echo.
    echo Please install Docker Desktop from:
    echo   https://www.docker.com/products/docker-desktop/
    echo.
    pause
    exit /b 1
)

docker info > nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not running!
    echo.
    echo Please start Docker Desktop and try again.
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

:: ─── DATA DIRECTORIES ─────────────────────────────────────────

echo Creating data directories...
if not exist "data\postgres" mkdir data\postgres
if not exist "data\uploads" mkdir data\uploads
echo.

:: ─── PULL IMAGES ──────────────────────────────────────────────

echo Pulling images...
ping -n 1 hub.docker.com > nul 2>&1
if %errorlevel% equ 0 (
    %COMPOSE_CMD% pull
    echo.
) else (
    echo [WARNING] No internet connection - using cached images if available
    echo.
)

:: ─── START POSTGRES ───────────────────────────────────────────

echo Starting PostgreSQL...
%COMPOSE_CMD% up -d postgres

echo.
echo Waiting for PostgreSQL to be ready...

:: ─── POLL PG_ISREADY ──────────────────────────────────────────

set MAX_ATTEMPTS=30
set ATTEMPT=0

:wait_loop
set /a ATTEMPT+=1
%COMPOSE_CMD% exec postgres pg_isready -U testforge > nul 2>&1
if %errorlevel% equ 0 goto postgres_ready

if %ATTEMPT% geq %MAX_ATTEMPTS% (
    echo [ERROR] PostgreSQL did not become ready in time.
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
    echo Please check the logs above and try again.
    pause
    exit /b 1
)

echo.
echo [OK] Database migration successful!
echo.

:: ─── START SERVICES ───────────────────────────────────────────

echo Starting TestForge services...
%COMPOSE_CMD% up -d backend frontend

echo.
echo Waiting for services to be ready...
timeout /t 5 /nobreak > nul

:: ─── VERIFY ────────────────────────────────────────────────────

echo.
echo ============================================================
echo                    INSTALLATION COMPLETE
echo ============================================================
echo.
echo  TestForge v1.0.0 is now running!
echo.
echo  Frontend:  http://localhost:4937
echo  Backend:   http://localhost:4936
echo  Database:  localhost:4935
echo.
echo  Logs:      %COMPOSE_CMD% logs -f
echo  Stop:      %COMPOSE_CMD% down
echo  Restart:   %COMPOSE_CMD% restart
echo.
echo ============================================================
echo.
pause