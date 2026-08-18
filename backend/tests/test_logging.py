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


def test_windows_portable_builds_share_the_portable_env_template() -> None:
    powershell_build = (ROOT / "build-windows.ps1").read_text()
    shell_build = (ROOT / "build-windows.sh").read_text()

    portable_env = 'windows-portable/.env.example'
    assert portable_env in powershell_build
    assert portable_env in shell_build
    assert 'cp .env.example "$OUTPUT_DIR/.env"' not in shell_build


def test_windows_portable_contract_has_one_custom_executable() -> None:
    launcher = (ROOT / "windows-portable/launcher.ps1").read_text()
    powershell_build = (ROOT / "build-windows.ps1").read_text()
    shell_build = (ROOT / "build-windows.sh").read_text()

    backend_exe = "spotify-quiz-backend.exe"
    assert backend_exe in launcher
    assert backend_exe in powershell_build
    assert backend_exe in shell_build

    for content in (launcher, powershell_build, shell_build):
        exe_names = {
            token.strip('"\'()[]{}:,;')
            for token in content.replace("\\", "/").split()
            if token.lower().endswith(".exe")
        }
        assert exe_names <= {backend_exe}
