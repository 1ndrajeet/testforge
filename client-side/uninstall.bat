@echo off
title TestForge Uninstaller

echo.
echo ============================================================
echo           UNINSTALLING TESTFORGE
echo ============================================================
echo.

:: Stop and remove containers
docker compose down -v 2> nul
docker-compose down -v 2> nul

:: Remove images
docker rmi 1ndrajeet/testforge-backend:lightweight 2> nul
docker rmi 1ndrajeet/testforge-frontend:lightweight 2> nul

:: Remove data
rmdir /s /q data 2> nul

echo.
echo ============================================================
echo           UNINSTALL COMPLETE
echo ============================================================
echo.
echo TestForge has been removed completely.
echo.
echo To reinstall, run: install.bat
pause