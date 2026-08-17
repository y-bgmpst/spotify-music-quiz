@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM Spotify Music Quiz - Windows Portable Launcher
REM Für öffentliche Dienst Laptops (GPO-kompatibel)

title Spotify Music Quiz - Starting...

REM Setze Arbeitsverzeichnis
cd /d "%~dp0"

REM Erstelle Datenverzeichnis falls nicht vorhanden
if not exist "data" mkdir data

set "PID_FILE=%~dp0data\backend.pid"
set "BACKEND_PID="

REM Prüfe nur den Backend-Prozess dieser Portable-Installation
if exist "%PID_FILE%" (
    set /p BACKEND_PID=<"%PID_FILE%"
    if defined BACKEND_PID (
        tasklist /FI "PID eq !BACKEND_PID!" /FI "IMAGENAME eq spotify-quiz-backend.exe" 2>NUL | findstr /I /C:"spotify-quiz-backend.exe" >NUL
        if not errorlevel 1 (
            echo Backend laeuft bereits (PID !BACKEND_PID!)...
            goto OPEN_BROWSER
        )
    )
    del /q "%PID_FILE%" >nul 2>&1
    set "BACKEND_PID="
)

if not exist "%~dp0spotify-quiz-backend.exe" (
    echo FEHLER: spotify-quiz-backend.exe fehlt in diesem Ordner.
    pause
    exit /b 1
)

REM Starte Backend im Hintergrund
echo Starte Spotify Quiz Backend...
start "Spotify Music Quiz Backend" /B "%~dp0spotify-quiz-backend.exe"

REM Warte bis Backend bereit ist (max 30 Sekunden)
echo Warte auf Backend-Start...
set /a counter=0
:WAIT_LOOP
timeout /t 1 /nobreak >nul
if not exist "%PID_FILE%" goto BACKEND_NOT_READY
set "BACKEND_PID="
set /p BACKEND_PID=<"%PID_FILE%"
if not defined BACKEND_PID goto BACKEND_NOT_READY
tasklist /FI "PID eq !BACKEND_PID!" /FI "IMAGENAME eq spotify-quiz-backend.exe" 2>NUL | findstr /I /C:"spotify-quiz-backend.exe" >NUL
if errorlevel 1 goto BACKEND_NOT_READY
curl -s http://127.0.0.1:8000/api/v1/health >nul 2>&1
if !ERRORLEVEL! EQU 0 goto BACKEND_READY
:BACKEND_NOT_READY
set /a counter+=1
if !counter! GEQ 30 (
    echo FEHLER: Backend startet nicht. Pruefen Sie Firewall/Antivirus.
    pause
    exit /b 1
)
goto WAIT_LOOP

:BACKEND_READY
echo Backend gestartet!

:OPEN_BROWSER
REM Öffne Browser
echo Oeffne Browser...
start "Spotify Music Quiz" http://127.0.0.1:8000/frontend/

echo.
echo ==============================================
echo Spotify Music Quiz laeuft!
echo.
echo Browser: http://127.0.0.1:8000/frontend/
echo Backend: http://127.0.0.1:8000/api/v1/health
echo.
echo Zum Beenden: Fenster schliessen oder STRG+C
echo ==============================================
echo.

REM Warte auf Benutzer-Eingabe zum Beenden
pause

REM Cleanup: nur den Prozess dieser Portable-Installation beenden
echo Beende Backend...
if exist "%PID_FILE%" (
    set "BACKEND_PID="
    set /p BACKEND_PID=<"%PID_FILE%"
    if defined BACKEND_PID (
        tasklist /FI "PID eq !BACKEND_PID!" /FI "IMAGENAME eq spotify-quiz-backend.exe" 2>NUL | findstr /I /C:"spotify-quiz-backend.exe" >NUL
        if not errorlevel 1 taskkill /T /F /PID !BACKEND_PID! >nul 2>&1
    )
)
del /q "%PID_FILE%" >nul 2>&1

echo Quiz beendet.
timeout /t 2 /nobreak >nul
endlocal
exit /b 0
