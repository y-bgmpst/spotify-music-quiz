# Windows Portable Build Script
# Run this on Windows with Python and Node.js installed

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Spotify Music Quiz - Windows Build" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Python not found. Install Python 3.11+" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js/npm not found. Install Node.js 18+" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Python found: $(python --version)" -ForegroundColor Green
Write-Host "✓ Node.js found: $(node --version)" -ForegroundColor Green
Write-Host ""

# Install PyInstaller if needed
Write-Host "Installing PyInstaller..." -ForegroundColor Yellow
python -m pip install pyinstaller | Out-Null
Write-Host "✓ PyInstaller ready" -ForegroundColor Green
Write-Host ""

# Build backend
Write-Host "Building backend..." -ForegroundColor Yellow
Write-Host "  → Installing backend dependencies..." -ForegroundColor Gray
python -m pip install -e "backend[dev]" | Out-Null

Write-Host "  → Compiling with PyInstaller..." -ForegroundColor Gray
pyinstaller windows-portable/backend.spec --clean --noconfirm

if (-not (Test-Path "dist/spotify-quiz-backend.exe")) {
    Write-Host "ERROR: Backend build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Backend compiled: dist/spotify-quiz-backend.exe" -ForegroundColor Green
Write-Host ""

# Build frontend
Write-Host "Building frontend..." -ForegroundColor Yellow
Write-Host "  → Installing frontend dependencies..." -ForegroundColor Gray
npm --prefix frontend ci | Out-Null

Write-Host "  → Building production bundle..." -ForegroundColor Gray
npm --prefix frontend run build | Out-Null

if (-not (Test-Path "frontend/dist/index.html")) {
    Write-Host "ERROR: Frontend build failed" -ForegroundColor Red
    exit 1
}

# Regression guard: the packaged app is served below /frontend/, so index.html
# must reference /frontend/assets/... - never hand-patch the generated HTML.
Write-Host "  -> Verifying asset base path..." -ForegroundColor Gray
npm --prefix frontend run check:base
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: dist/index.html does not reference /frontend/assets/" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Frontend built: frontend/dist/" -ForegroundColor Green
Write-Host ""

# Create portable package
Write-Host "Creating portable package..." -ForegroundColor Yellow
$outputDir = "build/spotify-quiz-portable"

# Clean and create output directory
if (Test-Path $outputDir) {
    Remove-Item $outputDir -Recurse -Force
}
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
New-Item -ItemType Directory -Path "$outputDir/data" -Force | Out-Null
New-Item -ItemType Directory -Path "$outputDir/config" -Force | Out-Null

# Copy files
Write-Host "  → Copying files..." -ForegroundColor Gray
Copy-Item "dist/spotify-quiz-backend.exe" "$outputDir/"
Copy-Item "frontend/dist" "$outputDir/frontend" -Recurse
Copy-Item "windows-portable/launcher.bat" "$outputDir/"
Copy-Item "windows-portable/restart-backend.bat" "$outputDir/"
Copy-Item "windows-portable/ANLEITUNG.txt" "$outputDir/"
Copy-Item "windows-portable/.env.example" "$outputDir/.env"
Copy-Item "README.md" "$outputDir/" -ErrorAction SilentlyContinue

# Create version file
$version = Get-Date -Format "yyyy-MM-dd"
@"
Spotify Music Quiz - Portable Edition
Version: 1.0
Build: $version
Platform: Windows 10/11 64-bit
"@ | Out-File "$outputDir/VERSION.txt" -Encoding utf8

Write-Host "✓ Package created: $outputDir/" -ForegroundColor Green
Write-Host ""

# Create ZIP archive
Write-Host "Creating ZIP archive..." -ForegroundColor Yellow
$zipFile = "build/spotify-quiz-portable-$version.zip"
if (Test-Path $zipFile) {
    Remove-Item $zipFile -Force
}
Compress-Archive -Path "$outputDir/*" -DestinationPath $zipFile -CompressionLevel Optimal
$zipSize = [math]::Round((Get-Item $zipFile).Length / 1MB, 2)
Write-Host "✓ ZIP created: $zipFile ($zipSize MB)" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "BUILD COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Portable package:" -ForegroundColor White
Write-Host "  → $outputDir/" -ForegroundColor Cyan
Write-Host ""
Write-Host "ZIP archive:" -ForegroundColor White
Write-Host "  → $zipFile" -ForegroundColor Cyan
Write-Host "  → Size: $zipSize MB" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Extract ZIP on target Windows system"
Write-Host "  2. Edit .env with Spotify Client ID"
Write-Host "  3. Double-click launcher.bat"
Write-Host ""
Write-Host "Test locally:" -ForegroundColor Yellow
Write-Host "  cd $outputDir"
Write-Host "  launcher.bat"
Write-Host ""
