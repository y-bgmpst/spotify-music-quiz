from __future__ import annotations

import gc
import sqlite3
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

from music_quiz.persistence.tokens import TokenRepository


def _remove_database(db_path: str) -> None:
    gc.collect()
    Path(db_path).unlink(missing_ok=True)


def test_oauth_state_is_one_time_and_survives_repository_restart() -> None:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as handle:
        db_path = handle.name
    try:
        first = TokenRepository(db_path)
        first.save_oauth_state("state-1", "verifier-1", "session-1")

        second = TokenRepository(db_path)
        assert second.consume_oauth_state("state-1", "session-1") == "verifier-1"
        assert second.consume_oauth_state("state-1", "session-1") is None
    finally:
        _remove_database(db_path)


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
        _remove_database(db_path)


def test_expired_oauth_state_is_rejected() -> None:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as handle:
        db_path = handle.name
    try:
        repo = TokenRepository(db_path)
        expired = (
            datetime.now(timezone.utc) - timedelta(seconds=repo.OAUTH_STATE_TTL_SECONDS + 1)
        ).isoformat()
        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "INSERT INTO oauth_states (state, verifier, session_hash, created_at) "
                "VALUES (?, ?, ?, ?)",
                ("expired-state", "verifier", repo._session_hash("session"), expired),
            )
            conn.commit()
        conn.close()
        assert repo.consume_oauth_state("expired-state", "session") is None
    finally:
        _remove_database(db_path)


def test_oauth_state_cannot_be_consumed_from_another_session() -> None:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as handle:
        db_path = handle.name
    try:
        repo = TokenRepository(db_path)
        repo.save_oauth_state("state-a", "verifier-a", "session-a")
        assert repo.consume_oauth_state("state-a", "session-b") is None
        assert repo.consume_oauth_state("state-a", "session-a") == "verifier-a"
    finally:
        _remove_database(db_path)


def test_oauth_callback_is_registered_as_a_fastapi_route() -> None:
    from music_quiz.main import app

    assert any(
        route.path == "/api/v1/auth/callback" and "GET" in route.methods for route in app.routes
    )


def test_concurrent_oauth_consumes_have_exactly_one_winner() -> None:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as handle:
        db_path = handle.name
    try:
        first = TokenRepository(db_path)
        second = TokenRepository(db_path)
        first.save_oauth_state("race", "verifier", "session")
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(
                pool.map(
                    lambda repo: repo.consume_oauth_state("race", "session"),
                    (first, second),
                )
            )
        assert sorted(result is not None for result in results) == [False, True]
    finally:
        _remove_database(db_path)
