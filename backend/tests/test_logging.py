from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).parents[2]


def test_documented_local_uvicorn_start_disables_access_logging() -> None:
    readme = (ROOT / "README.md").read_text()
    assert "uvicorn music_quiz.main:app --reload --no-access-log" in readme


def test_portable_server_disables_access_logging() -> None:
    server = (ROOT / "windows-portable/server.py").read_text()
    assert "access_log=False" in server


def test_portable_server_uses_a_per_installation_pid_file() -> None:
    server = (ROOT / "windows-portable/server.py").read_text()
    launcher = (ROOT / "windows-portable/launcher.ps1").read_text()

    assert "backend.pid" in server
    assert "backend.pid" in launcher
    assert "Stop-Process -Id" in launcher


def test_portable_restart_script_targets_the_pid_file() -> None:
    restarter = (ROOT / "windows-portable/launcher.ps1").read_text()

    assert "backend.pid" in restarter
    assert "RestartBackend" in restarter


def test_windows_launchers_delegate_to_powershell_and_keep_console_open() -> None:
    launcher = (ROOT / "windows-portable/launcher.bat").read_text()
    restarter = (ROOT / "windows-portable/restart-backend.bat").read_text()

    assert "launcher.ps1" in launcher
    assert "pause" in launcher
    assert "launcher.ps1" in restarter
    assert "pause" in restarter
