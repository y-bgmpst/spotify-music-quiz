#!/usr/bin/env bash
# Build script for Windows portable version (Linux/Wine cross-compile)
# Requires: wine, python-wine, node

set -e

echo "========================================"
echo "Spotify Music Quiz - Windows Build"
echo "Cross-compile via Wine"
echo "========================================"
echo ""

# Check prerequisites
echo "Checking prerequisites..."
if ! command -v wine &> /dev/null; then
    echo "ERROR: Wine not found. Install: sudo pacman -S wine"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "ERROR: Node.js not found"
    exit 1
fi

echo "✓ Wine found"
echo "✓ Node.js found"
echo ""

# Install Wine Python if needed
if [ ! -d "$HOME/.wine/drive_c/Python311" ]; then
    echo "Installing Python in Wine..."
    echo "  → Download Python 3.11 installer from python.org"
    echo "  → Run: wine python-3.11.x-amd64.exe"
    echo ""
    echo "ERROR: Python not found in Wine. Install it first."
    exit 1
fi

echo "Building frontend..."
npm --prefix frontend install
npm --prefix frontend run build
# Regression guard: the packaged app is served below /frontend/, so index.html
# must reference /frontend/assets/... - never hand-patch the generated HTML.
npm --prefix frontend run check:base
echo "✓ Frontend built"
echo ""

echo "Building backend with Wine..."
wine python -m pip install pyinstaller
wine pyinstaller windows-portable/backend.spec --clean --noconfirm
echo "✓ Backend compiled"
echo ""

echo "Creating portable package..."
OUTPUT_DIR="build/spotify-quiz-portable"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/data"
mkdir -p "$OUTPUT_DIR/config"

# The only custom executable in the portable package is the bundled backend.
cp dist/spotify-quiz-backend.exe "$OUTPUT_DIR/"
cp -r frontend/dist "$OUTPUT_DIR/frontend"
cp windows-portable/launcher.bat "$OUTPUT_DIR/"
cp windows-portable/restart-backend.bat "$OUTPUT_DIR/"
cp windows-portable/launcher.ps1 "$OUTPUT_DIR/"
cp windows-portable/ANLEITUNG.txt "$OUTPUT_DIR/"
cp windows-portable/.env.example "$OUTPUT_DIR/.env"

# Enforce the portable contract across the complete package tree, not only the root.
mapfile -t packaged_executable_paths < <(find "$OUTPUT_DIR" -type f -iname "*.exe" -printf '%P\n')
if [ "${#packaged_executable_paths[@]}" -ne 1 ] || [ "${packaged_executable_paths[0]}" != "spotify-quiz-backend.exe" ]; then
    echo "ERROR: Unexpected executable set in portable package: ${packaged_executable_paths[*]}"
    exit 1
fi

echo "✓ Package created: $OUTPUT_DIR/"
echo ""

echo "Creating ZIP..."
cd build
zip -r "spotify-quiz-portable-$(date +%Y-%m-%d).zip" spotify-quiz-portable/
cd ..
echo "✓ ZIP created"
echo ""

echo "========================================"
echo "BUILD COMPLETE!"
echo "========================================"
