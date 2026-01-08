@echo off
echo =========================================
echo       SRE AGENT - QUICK START
echo =========================================
echo.
echo 1. Start with Docker (Recommended)
echo 2. Start Locally (Python)
echo 3. Run Setup Wizard
echo.
set /p choice="Select option (1-3): "

if "%choice%"=="1" goto docker
if "%choice%"=="2" goto local
if "%choice%"=="3" goto setup
goto end

:docker
echo Starting Docker Containers...
docker-compose up -d --build
echo.
echo API is running at http://localhost:8000
pause
goto end

:local
echo Starting Python Agent...
python src/api.py
goto end

:setup
python setup_wizard.py
pause
goto end

:end
