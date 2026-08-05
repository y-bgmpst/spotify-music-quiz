#!/usr/bin/env bash
# Package the Linux portable build: PyInstaller backend binary + built frontend.
# Expects `pyinstaller build-scripts/backend.spec` and `npm --prefix frontend run build`
# to have run already.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BINARY="dist/spotify-quiz-backend"
FRONTEND_DIST="frontend/dist"
STAGE="dist-linux/spotify-music-quiz"
ARCHIVE="dist-linux/spotify-music-quiz-linux.tar.gz"

[ -f "$BINARY" ] || { echo "ERROR: $BINARY not found - run pyinstaller build-scripts/backend.spec first" >&2; exit 1; }
[ -d "$FRONTEND_DIST" ] || { echo "ERROR: $FRONTEND_DIST not found - run npm --prefix frontend run build first" >&2; exit 1; }

# Fail loudly instead of shipping a blank page: the packaged frontend is served
# below /frontend/, so index.html must reference /frontend/assets/.
npm --prefix frontend run check:base

rm -rf dist-linux
mkdir -p "$STAGE/frontend" "$STAGE/data"

cp "$BINARY" "$STAGE/spotify-quiz-backend"
chmod +x "$STAGE/spotify-quiz-backend"
cp -R "$FRONTEND_DIST/." "$STAGE/frontend/"
[ -f .env.example ] && cp .env.example "$STAGE/.env.example"
[ -f WINDOWS_PORTABLE.md ] && cp WINDOWS_PORTABLE.md "$STAGE/README-portable.md"

cat > "$STAGE/start.sh" <<'LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec ./spotify-quiz-backend
LAUNCHER
chmod +x "$STAGE/start.sh"

tar -czf "$ARCHIVE" -C dist-linux spotify-music-quiz
echo "Created $ARCHIVE"
