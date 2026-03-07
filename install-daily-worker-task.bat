@echo off
REM Run as Administrator to create Cursor Daily Worker scheduled task
REM Right-click -> Run as administrator

echo ============================================
echo Cursor Daily Worker - Task Setup
echo ============================================
echo.
echo Prerequisites (run these first if not done):
echo   1. Cursor CLI: irm 'https://cursor.com/install?win32=true' ^| iex
echo   2. ripgrep:     choco install ripgrep   OR download from GitHub
echo   3. Auth:        agent login   OR set CURSOR_API_KEY
echo.
echo Creating scheduled task...

schtasks /create /tn "Cursor Daily Worker" /tr "e:\workspace\take-you-to-play\run-daily-worker.bat" /sc DAILY /st 09:00 /f /rl HIGHEST

if %ERRORLEVEL% equ 0 (
    echo.
    echo [OK] Task created successfully!
    echo Task will run daily at 09:00
    echo.
    echo To modify: taskschd.msc -^> find "Cursor Daily Worker"
    echo To run now: schtasks /run /tn "Cursor Daily Worker"
) else (
    echo.
    echo [ERROR] Failed. Make sure you run this as Administrator.
    echo Right-click this file -^> "Run as administrator"
)

pause
