# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for the Spotify Music Quiz backend (Linux build).

Reuses the portable server entry point in windows-portable/server.py, which is
platform independent, and embeds the SQLite schema plus the uvicorn/fastapi
hidden imports PyInstaller cannot discover statically.
"""

from pathlib import Path

block_cipher = None

project_root = Path.cwd()
entry_point = project_root / 'windows-portable' / 'server.py'
backend_src = project_root / 'backend' / 'src' / 'music_quiz'

datas = [
    (str(backend_src / 'persistence/schema.sql'), 'music_quiz/persistence'),
]

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
    [str(entry_point)],
    pathex=[str(project_root / 'backend' / 'src')],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
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
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
