@echo off
setlocal
REM Spotify Music Quiz - restart via the PowerShell launcher

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher.ps1" -RestartBackend
if errorlevel 1 (
    echo.
    echo Der Backend-Restart wurde mit einem Fehler beendet.
    pause
    exit /b 1
)

endlocal
exit /b 0
