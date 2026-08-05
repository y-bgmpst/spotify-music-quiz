@echo off
REM Spotify Music Quiz - Windows Portable Launcher
REM Für öffentliche Dienst Laptops (GPO-kompatibel)

title Spotify Music Quiz - Starting...

REM Setze Arbeitsverzeichnis
cd /d "%~dp0"

REM Erstelle Datenverzeichnis falls nicht vorhanden
if not exist "data" mkdir data

REM Prüfe ob Backend bereits läuft
tasklist /FI "IMAGENAME eq spotify-quiz-backend.exe" 2>NUL | find /I /N "spotify-quiz-backend.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo Backend laeuft bereits...
    goto OPEN_BROWSER
)

REM Starte Backend im Hintergrund
echo Starte Spotify Quiz Backend...
start "Spotify Music Quiz Backend" /B "%~dp0spotify-quiz-backend.exe"

REM Warte bis Backend bereit ist (max 30 Sekunden)
echo Warte auf Backend-Start...
set /a counter=0
:WAIT_LOOP
timeout /t 1 /nobreak >nul
curl -s http://127.0.0.1:8000/api/v1/health >nul 2>&1
if %ERRORLEVEL% EQU 0 goto BACKEND_READY
set /a counter+=1
if %counter% GEQ 30 (
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

REM Cleanup: Backend beenden
echo Beende Backend...
taskkill /F /IM spotify-quiz-backend.exe >nul 2>&1

echo Quiz beendet.
timeout /t 2 /nobreak >nul
