from __future__ import annotations

import importlib
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def api(tmp_path, monkeypatch) -> Iterator[tuple[TestClient, object]]:
    """Reload the app against an isolated database and deterministic config."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("SPOTIFY_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://127.0.0.1:5173")
    monkeypatch.setenv("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:8000/api/v1/auth/callback")
    monkeypatch.setenv("ADDITIONAL_ALLOWED_ORIGINS", "")
    monkeypatch.setenv("ALLOW_LOCALHOST_ORIGIN", "0")

    import music_quiz.main as main

    main = importlib.reload(main)
    with TestClient(main.app) as client:
        yield client, main
