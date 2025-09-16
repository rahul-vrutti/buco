@echo off
REM Build script for subco service on Windows
REM Usage: build-subco.bat [version]

set VERSION=%1
if "%VERSION%"=="" set VERSION=latest

set REGISTRY=100.103.254.213:5001
set SERVICE_NAME=subco
set BUILD_DIR=..\subco

echo 🏗️  Building %SERVICE_NAME%:%VERSION%
echo 📁 Build directory: %BUILD_DIR%
echo 🐳 Registry: %REGISTRY%

REM Check if build directory exists
if not exist "%BUILD_DIR%" (
    echo ❌ Build directory not found: %BUILD_DIR%
    exit /b 1
)

REM Check if Dockerfile exists
if not exist "%BUILD_DIR%\Dockerfile" (
    echo ❌ Dockerfile not found in: %BUILD_DIR%\Dockerfile
    exit /b 1
)

REM Build the image
echo 🔨 Building Docker image...
cd "%BUILD_DIR%"
docker build -t "%SERVICE_NAME%:%VERSION%" -t "%SERVICE_NAME%:latest" .

if errorlevel 1 (
    echo ❌ Docker build failed
    exit /b 1
)

REM Tag for registry
echo 🏷️  Tagging for registry...
docker tag "%SERVICE_NAME%:%VERSION%" "%REGISTRY%/%SERVICE_NAME%:%VERSION%"
docker tag "%SERVICE_NAME%:%VERSION%" "%REGISTRY%/%SERVICE_NAME%:latest"

REM Push to registry
echo 🚀 Pushing to registry...
docker push "%REGISTRY%/%SERVICE_NAME%:%VERSION%"
docker push "%REGISTRY%/%SERVICE_NAME%:latest"

if errorlevel 1 (
    echo ❌ Failed to push to registry
    exit /b 1
) else (
    echo ✅ Successfully built and pushed %SERVICE_NAME%:%VERSION%
    echo 📦 Available at:
    echo    - %REGISTRY%/%SERVICE_NAME%:%VERSION%
    echo    - %REGISTRY%/%SERVICE_NAME%:latest
)