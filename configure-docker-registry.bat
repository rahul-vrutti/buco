@echo off
REM Script to configure Docker for insecure registry
REM This script helps configure Docker Desktop to work with HTTP registries

echo 🐳 Docker Registry Configuration Helper
echo.
echo Your registry: 100.103.254.213:5001
echo.
echo ❌ The error "server gave HTTP response to HTTPS client" means:
echo    Docker is trying to use HTTPS but your registry uses HTTP
echo.
echo 🔧 To fix this in Docker Desktop:
echo    1. Open Docker Desktop
echo    2. Go to Settings ^> Docker Engine
echo    3. Add this to the JSON configuration:
echo.
echo    "insecure-registries": [
echo      "100.103.254.213:5001"
echo    ]
echo.
echo 💡 Example Docker Engine configuration:
echo {
echo   "builder": {
echo     "gc": {
echo       "defaultKeepStorage": "20GB",
echo       "enabled": true
echo     }
echo   },
echo   "experimental": false,
echo   "insecure-registries": [
echo     "100.103.254.213:5001"
echo   ]
echo }
echo.
echo 🔄 After making changes:
echo    1. Click "Apply & Restart" in Docker Desktop
echo    2. Wait for Docker to restart
echo    3. Try uploading your version file again
echo.
echo 🧪 To test if it's working:
echo    docker push 100.103.254.213:5001/test:latest
echo.
pause