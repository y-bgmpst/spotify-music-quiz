@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM Spotify Music Quiz - Restart only this portable installation

cd /d "%~dp0"
if not exist "data" mkdir data
set "PID_FILE=%~dp0data\backend.pid"
set "BACKEND_PID="

if exist "%PID_FILE%" (
    set /p BACKEND_PID=<"%PID_FILE%"
    if defined BACKEND_PID (
        tasklist /FI "PID eq !BACKEND_PID!" /FI "IMAGENAME eq spotify-quiz-backend.exe" 2>NUL | findstr /I /C:"spotify-quiz-backend.exe" >NUL
        if not errorlevel 1 (
            echo Beende Backend dieser Portable-Installation (PID !BACKEND_PID!)...
            taskkill /T /F /PID !BACKEND_PID! >nul 2>&1
            timeout /t 1 /nobreak >nul
        )
    )
    del /q "%PID_FILE%" >nul 2>&1
)

echo Starte Backend neu...
call "%~dp0launcher.bat"
endlocal
