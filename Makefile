.PHONY: setup format lint typecheck test e2e build verify clean windows-portable build-frontend build-backend package help

help:
	@echo "Spotify Music Quiz - Build Targets"
	@echo ""
	@echo "Development:"
	@echo "  make setup             - Install all dependencies"
	@echo "  make verify            - Run all checks (format, lint, test, build)"
	@echo ""
	@echo "Windows Portable:"
	@echo "  make windows-portable  - Build complete Windows package (run on Windows)"
	@echo "  make build-frontend    - Build React frontend only"
	@echo "  make build-backend     - Compile Python backend to .exe only"
	@echo "  make package           - Create portable ZIP (after build)"
	@echo "  make clean             - Remove build artifacts"

setup:
	python3 -m venv .venv
	.venv/bin/pip install -e './backend[dev]'
	npm --prefix frontend install

format:
	.venv/bin/ruff format backend/src backend/tests
	npm --prefix frontend run format

lint:
	.venv/bin/ruff check backend/src backend/tests
	npm --prefix frontend run lint

typecheck:
	.venv/bin/mypy backend/src
	npm --prefix frontend run typecheck

test:
	.venv/bin/pytest backend/tests -q
	npm --prefix frontend test -- --run

e2e:
	npm --prefix frontend run e2e

build:
	npm --prefix frontend run build

verify: format lint typecheck test build

# Windows portable (run on Windows with PowerShell)
windows-portable:
	@echo "Starting Windows build..."
	@echo "Note: Run this on Windows system with Python and Node.js installed"
	powershell -ExecutionPolicy Bypass -File build-windows.ps1

# Build frontend only
build-frontend:
	@echo "Building frontend..."
	npm --prefix frontend install
	npm --prefix frontend run build
	@echo "✓ Frontend: frontend/dist/"

# Build backend only (requires PyInstaller, run on Windows)
build-backend:
	@echo "Building backend..."
	pip install pyinstaller
	pyinstaller windows-portable/backend.spec --clean --noconfirm
	@echo "✓ Backend: dist/spotify-quiz-backend.exe"

# Create portable package (assumes backend + frontend are built)
package:
	@echo "Creating portable package..."
	mkdir -p build/spotify-quiz-portable/data
	mkdir -p build/spotify-quiz-portable/config
	cp dist/spotify-quiz-backend.exe build/spotify-quiz-portable/ || echo "Backend not found - run 'make build-backend' first"
	cp -r frontend/dist build/spotify-quiz-portable/frontend || echo "Frontend not found - run 'make build-frontend' first"
	cp windows-portable/launcher.bat build/spotify-quiz-portable/
	cp windows-portable/ANLEITUNG.txt build/spotify-quiz-portable/
	cp .env.example build/spotify-quiz-portable/.env
	@echo "✓ Package: build/spotify-quiz-portable/"
	@echo "Creating ZIP..."
	cd build && zip -r spotify-quiz-portable-$$(date +%Y%m%d).zip spotify-quiz-portable/
	@echo "✓ ZIP created: build/spotify-quiz-portable-$$(date +%Y%m%d).zip"

# Clean build artifacts
clean:
	rm -rf build/ dist/ frontend/dist/
	rm -rf backend/src/*.egg-info
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	@echo "✓ Build artifacts cleaned"

