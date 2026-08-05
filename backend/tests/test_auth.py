from __future__ import annotations

import tempfile
from pathlib import Path

from music_quiz.persistence.tokens import TokenRepository


def test_oauth_state_is_one_time_and_survives_repository_restart() -> None:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as handle:
        db_path = handle.name
    try:
        first = TokenRepository(db_path)
        first.save_oauth_state("state-1", "verifier-1")

        second = TokenRepository(db_path)
        assert second.consume_oauth_state("state-1") == "verifier-1"
        assert second.consume_oauth_state("state-1") is None
    finally:
        Path(db_path).unlink(missing_ok=True)


def test_session_lookup_uses_opaque_cookie_value() -> None:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as handle:
        db_path = handle.name
    try:
        repo = TokenRepository(db_path)
        session_id = repo.create_session()

        assert repo.get_session_user(session_id) == "default"
        assert repo.get_session_user("not-the-session") is None
        repo.delete_session(session_id)
        assert repo.get_session_user(session_id) is None
    finally:
        Path(db_path).unlink(missing_ok=True)


def test_oauth_callback_is_registered_as_a_fastapi_route() -> None:
    from music_quiz.main import app

    assert any(
        route.path == "/api/v1/auth/callback" and "GET" in route.methods
        for route in app.routes
    )
