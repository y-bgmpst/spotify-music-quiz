"""Persistent, bounded, expiring, one-time-use OAuth state store.

Pending PKCE state is stored in the application's local SQLite database. This
keeps an in-progress Spotify login valid across development-server reloads and
ensures that multiple local worker processes share the same state.

Consumption is transactional and destructive: a state is returned at most once.
Unknown, missing, replayed and expired values deliberately have the same result.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Callable

from music_quiz.auth import AuthState

DEFAULT_TTL_SECONDS = 600
DEFAULT_MAX_PENDING = 32


class OAuthStateStore:
    """SQLite-backed OAuth state store with TTL, capacity and atomic consume."""

    def __init__(
        self,
        db_path: str,
        clock: Callable[[], float],
        ttl_seconds: float = DEFAULT_TTL_SECONDS,
        max_pending: int = DEFAULT_MAX_PENDING,
    ) -> None:
        if ttl_seconds <= 0:
            raise ValueError("ttl_seconds must be positive")
        if max_pending < 1:
            raise ValueError("max_pending must be at least 1")

        self._db_path = db_path
        self._clock = clock
        self._ttl_seconds = ttl_seconds
        self._max_pending = max_pending
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._db_path, timeout=5.0)
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    def _ensure_schema(self) -> None:
        Path(self._db_path).parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS oauth_pending_states (
                    state TEXT PRIMARY KEY,
                    verifier TEXT NOT NULL,
                    created_at REAL NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_oauth_pending_states_created
                ON oauth_pending_states(created_at)
                """
            )

    def __len__(self) -> int:
        self.purge_expired()
        with self._connect() as connection:
            row = connection.execute(
                "SELECT COUNT(*) FROM oauth_pending_states"
            ).fetchone()
        return int(row[0]) if row else 0

    @property
    def max_pending(self) -> int:
        return self._max_pending

    def put(self, auth: AuthState) -> None:
        """Persist a pending state and evict expired or oldest entries."""
        now = self._clock()
        expires_before = now - self._ttl_seconds
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "DELETE FROM oauth_pending_states WHERE created_at <= ?",
                (expires_before,),
            )
            connection.execute(
                """
                INSERT OR REPLACE INTO oauth_pending_states(state, verifier, created_at)
                VALUES (?, ?, ?)
                """,
                (auth.state, auth.verifier, now),
            )
            connection.execute(
                """
                DELETE FROM oauth_pending_states
                WHERE state IN (
                    SELECT state
                    FROM oauth_pending_states
                    ORDER BY created_at ASC, state ASC
                    LIMIT MAX(
                        (SELECT COUNT(*) FROM oauth_pending_states) - ?,
                        0
                    )
                )
                """,
                (self._max_pending,),
            )

    def consume(self, state: str | None) -> AuthState | None:
        """Atomically return and delete one valid state."""
        if not state:
            return None

        now = self._clock()
        expires_before = now - self._ttl_seconds
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "DELETE FROM oauth_pending_states WHERE created_at <= ?",
                (expires_before,),
            )
            row = connection.execute(
                """
                SELECT verifier
                FROM oauth_pending_states
                WHERE state = ?
                """,
                (state,),
            ).fetchone()
            if row is None:
                return None
            connection.execute(
                "DELETE FROM oauth_pending_states WHERE state = ?",
                (state,),
            )

        return AuthState(state=state, verifier=str(row[0]))

    def purge_expired(self) -> int:
        expires_before = self._clock() - self._ttl_seconds
        with self._connect() as connection:
            cursor = connection.execute(
                "DELETE FROM oauth_pending_states WHERE created_at <= ?",
                (expires_before,),
            )
        return max(cursor.rowcount, 0)

    def clear(self) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM oauth_pending_states")
