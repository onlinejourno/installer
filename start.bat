@echo off
REM OnlineJourno Installer launcher for Windows.
REM Usage: start.bat

setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "PORT=7000"
if defined INSTALLER_PORT set "PORT=%INSTALLER_PORT%"
set "URL=http://127.0.0.1:%PORT%"

echo OnlineJourno Installer
echo ======================

node --version >nul 2>&1
if errorlevel 1 (
  echo Error: Node.js is required but not found.
  echo Install Node 18+ from https://nodejs.org/ and try again.
  exit /b 1
)

echo Node.js found.

docker --version >nul 2>&1
if errorlevel 1 (
  echo Error: Docker is required but not found.
  echo Install Docker Desktop from https://docs.docker.com/get-docker/ and try again.
  exit /b 1
)

docker compose version >nul 2>&1
if errorlevel 1 (
  echo Error: Docker Compose is required but not found.
  echo Install Docker Desktop or the Docker Compose plugin.
  exit /b 1
)

echo Docker and Docker Compose found.
echo Starting installer at %URL%

REM Try to open the browser.
start "" "%URL%"

cd /d "%SCRIPT_DIR%"
node server.mjs
