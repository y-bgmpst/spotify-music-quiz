[CmdletBinding()]
param(
    [switch]$RestartBackend
)

$ErrorActionPreference = "Stop"
$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $baseDir "data"
$pidFile = Join-Path $dataDir "backend.pid"
$backendPath = Join-Path $baseDir "spotify-quiz-backend.exe"
$startedProcess = $null
$ownsBackend = $false

function Get-PortableBackend {
    if (-not (Test-Path -LiteralPath $pidFile)) {
        return $null
    }

    $pidText = (Get-Content -LiteralPath $pidFile -Raw).Trim()
    $backendPid = 0
    if (-not [int]::TryParse($pidText, [ref]$backendPid)) {
        return $null
    }

    try {
        $process = Get-Process -Id $backendPid -ErrorAction Stop
        if ($process.ProcessName -ne "spotify-quiz-backend") {
            return $null
        }
        return $process
    }
    catch {
        return $null
    }
}

function Stop-PortableBackend {
    param([System.Diagnostics.Process]$Process)

    if ($null -ne $Process -and -not $Process.HasExited) {
        Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
        $Process.WaitForExit(5000)
    }
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

try {
    Set-Location -LiteralPath $baseDir
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null

    $existingBackend = Get-PortableBackend
    if ($RestartBackend -and $null -ne $existingBackend) {
        Write-Host "Beende Backend dieser Portable-Installation (PID $($existingBackend.Id))..."
        Stop-PortableBackend $existingBackend
        $existingBackend = $null
    }

    if ($null -eq $existingBackend) {
        if (-not (Test-Path -LiteralPath $backendPath)) {
            throw "spotify-quiz-backend.exe fehlt in diesem Ordner."
        }

        Write-Host "Starte Spotify Quiz Backend..."
        $startedProcess = Start-Process -FilePath $backendPath -WorkingDirectory $baseDir -PassThru -WindowStyle Hidden
        $ownsBackend = $true

        Write-Host "Warte auf Backend-Start..."
        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            Start-Sleep -Seconds 1
            if ($startedProcess.HasExited) {
                throw "Backend wurde beendet, bevor es erreichbar war (Exit-Code $($startedProcess.ExitCode))."
            }
            try {
                $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8000/api/v1/health" -TimeoutSec 2
                if ($response.StatusCode -eq 200) {
                    $ready = $true
                    break
                }
            }
            catch {
                # Backend is still starting.
            }
        }
        if (-not $ready) {
            throw "Backend startet nicht. Pruefen Sie Firewall/Antivirus."
        }
        Write-Host "Backend gestartet!"
    }
    else {
        Write-Host "Backend laeuft bereits (PID $($existingBackend.Id))..."
    }

    Write-Host "Oeffne Browser..."
    Start-Process "http://127.0.0.1:8000/frontend/"
    Write-Host ""
    Write-Host "=============================================="
    Write-Host "Spotify Music Quiz laeuft!"
    Write-Host ""
    Write-Host "Browser: http://127.0.0.1:8000/frontend/"
    Write-Host "Backend: http://127.0.0.1:8000/api/v1/health"
    Write-Host ""
    Read-Host "Zum Beenden Enter druecken"
}
catch {
    Write-Host "FEHLER: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    if ($ownsBackend -and $null -ne $startedProcess) {
        Write-Host "Beende Backend..."
        Stop-PortableBackend $startedProcess
    }
}
