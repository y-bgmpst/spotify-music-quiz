"""
Wrapper script for PyInstaller to run FastAPI app with Uvicorn
This is the entry point for the Windows executable
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = (
    Path(sys.executable).resolve().parent
    if getattr(sys, 'frozen', False)
    else Path(__file__).resolve().parent.parent
)
os.chdir(BASE_DIR)

# Load the portable .env before importing the app, then apply safe local defaults.
load_dotenv(BASE_DIR / '.env')
os.environ.setdefault('DATABASE_PATH', str(BASE_DIR / 'data' / 'quiz.db'))
os.environ.setdefault('FRONTEND_ORIGIN', 'http://127.0.0.1:8000')
os.environ.setdefault('BACKEND_ORIGIN', 'http://127.0.0.1:8000')

(BASE_DIR / 'data').mkdir(exist_ok=True)

def main():
    """Start Uvicorn server"""
    import uvicorn
    from music_quiz.main import app

    # Serve frontend static files
    from fastapi.staticfiles import StaticFiles
    frontend_dir = BASE_DIR / 'frontend'
    if frontend_dir.exists():
        app.mount('/frontend', StaticFiles(directory=str(frontend_dir), html=True), name='frontend')

    # Start server
    uvicorn.run(
        app,
        host='127.0.0.1',
        port=8000,
        log_level='info',
    )

if __name__ == '__main__':
    main()
