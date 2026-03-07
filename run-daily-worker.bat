@echo off
cd /d e:\workspace\take-you-to-play

set CURSOR_API_KEY=key_d1e2b6ed03a3d5c1c3f0879d44606032343a93b637c9a80250cbe68f40edc34b

where agent >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Cursor CLI agent not found. Install: irm 'https://cursor.com/install?win32=true' ^| iex
    exit /b 1
)

agent -p --force "Read and execute the instructions in .cursor/daily-worker.md. Work fully automatically."

if %ERRORLEVEL% equ 0 (
    echo [OK] Daily worker completed successfully
) else (
    echo [ERROR] Daily worker failed with exit code %ERRORLEVEL%
)

exit /b %ERRORLEVEL%
