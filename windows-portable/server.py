"""
Wrapper script for PyInstaller to run FastAPI app with Uvicorn
This is the entry point for the Windows executable
"""

import os
import sys
from pathlib import Path

# Set environment variables for portable mode
os.environ.setdefault('DATABASE_PATH', './data/quiz.db')
os.environ.setdefault('FRONTEND_ORIGIN', 'http://127.0.0.1:8000')
os.environ.setdefault('BACKEND_ORIGIN', 'http://127.0.0.1:8000')

# Ensure data directory exists
data_dir = Path('./data')
data_dir.mkdir(exist_ok=True)

def main():
    """Start Uvicorn server"""
    import uvicorn
    from music_quiz.main import app

    # Read .env if exists
    env_file = Path('.env')
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ[key.strip()] = value.strip()

    # Serve frontend static files
    from fastapi.staticfiles import StaticFiles
    frontend_dir = Path(__file__).parent / 'frontend'
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
