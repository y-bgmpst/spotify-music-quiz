@echo off
setlocal
REM Spotify Music Quiz - stable PowerShell entry point

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher.ps1"
if errorlevel 1 (
    echo.
    echo Der Launcher wurde mit einem Fehler beendet.
    pause
    exit /b 1
)

endlocal
exit /b 0
