@echo off
REM Build script for both buco and subco services on Windows
REM Usage: build-all.bat [version]

set VERSION=%1
if "%VERSION%"=="" set VERSION=latest

set REGISTRY=100.103.254.213:5001

echo 🏗️  Building both buco and subco services with version: %VERSION%
echo 🐳 Registry: %REGISTRY%
echo.

REM Build buco first
echo ========================================
echo 🔨 Building BUCO service
echo ========================================
call build-buco.bat %VERSION%
if errorlevel 1 (
    echo ❌ Failed to build buco
    exit /b 1
)

echo.
echo ========================================
echo 🔨 Building SUBCO service  
echo ========================================
call build-subco.bat %VERSION%
if errorlevel 1 (
    echo ❌ Failed to build subco
    exit /b 1
)

echo.
echo ✅ Successfully built and pushed both services!
echo 📦 Available images:
echo    - %REGISTRY%/buco:%VERSION%
echo    - %REGISTRY%/buco:latest
echo    - %REGISTRY%/subco:%VERSION%
echo    - %REGISTRY%/subco:latest

echo.
echo 📋 To verify images were pushed successfully:
echo    docker images %REGISTRY%/*