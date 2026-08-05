# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for Spotify Music Quiz Backend
Builds standalone Windows executable with all dependencies embedded
"""

from pathlib import Path

block_cipher = None
spec_dir = Path(__file__).resolve().parent
project_root = spec_dir.parent

# Collect all data files
backend_src = project_root / 'backend/src/music_quiz'
datas = [
    (str(backend_src / 'persistence/schema.sql'), 'music_quiz/persistence'),
]

# Hidden imports that PyInstaller might miss
hiddenimports = [
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'httpx',
    'fastapi',
    'pydantic',
    'sqlite3',
]

a = Analysis(
    [str(spec_dir / 'server.py')],
    pathex=[str(project_root / 'backend/src')],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='spotify-quiz-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Show console window (can hide with False)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
