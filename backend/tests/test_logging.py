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

    portable_env = "windows-portable/.env.example"
    assert portable_env in powershell_build
    assert portable_env in shell_build
    assert 'cp .env.example "$OUTPUT_DIR/.env"' not in shell_build


def test_windows_portable_builds_package_only_the_backend_executable() -> None:
    powershell_build = (ROOT / "build-windows.ps1").read_text()
    shell_build = (ROOT / "build-windows.sh").read_text()

    assert 'Copy-Item "dist/spotify-quiz-backend.exe" "$outputDir/"' in powershell_build
    assert 'cp dist/spotify-quiz-backend.exe "$OUTPUT_DIR/"' in shell_build

    assert 'Get-ChildItem -LiteralPath $outputDir -Filter "*.exe" -File -Recurse' in powershell_build
    assert '[IO.Path]::GetRelativePath($outputDir, $_.FullName)' in powershell_build
    assert '$packagedExecutablePaths.Count -ne 1' in powershell_build
    assert '$packagedExecutablePaths[0] -ne "spotify-quiz-backend.exe"' in powershell_build

    assert 'find "$OUTPUT_DIR" -type f -iname "*.exe"' in shell_build
    assert 'realpath --relative-to="$OUTPUT_DIR"' in shell_build
    assert '${#packaged_executable_paths[@]}' in shell_build
    assert '${packaged_executable_paths[0]}' in shell_build
    assert '-maxdepth 1' not in shell_build


def test_shell_windows_portable_build_cleans_stale_output() -> None:
    shell_build = (ROOT / "build-windows.sh").read_text()

    assert 'rm -rf "$OUTPUT_DIR"' in shell_build
