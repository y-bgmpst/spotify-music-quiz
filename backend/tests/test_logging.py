from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).parents[2]


def test_documented_local_uvicorn_start_disables_access_logging() -> None:
    readme = (ROOT / "README.md").read_text()
    assert "uvicorn music_quiz.main:app --reload --no-access-log" in readme


def test_portable_server_disables_access_logging() -> None:
    server = (ROOT / "windows-portable/server.py").read_text()
    assert "access_log=False" in server
