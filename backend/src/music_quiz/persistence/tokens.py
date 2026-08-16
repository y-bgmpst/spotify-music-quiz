from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class SpotifyToken:
    """Spotify OAuth token with metadata."""

    user_id: str
    access_token: str
    refresh_token: str
    token_type: str
    expires_at: int  # Unix timestamp
    scope: str

    def is_expired(self, buffer_seconds: int = 60) -> bool:
        """Check if token is expired (with optional buffer)."""
        return time.time() >= (self.expires_at - buffer_seconds)


class TokenRepository:
    """SQLite repository for Spotify OAuth tokens."""

    OAUTH_STATE_TTL_SECONDS = 10 * 60

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        """Ensure auth_tokens table exists."""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        schema_path = Path(__file__).parent / "schema.sql"
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            conn.executescript(schema_path.read_text())
            columns = {row[1] for row in conn.execute("PRAGMA table_info(oauth_states)")}
            if "session_hash" not in columns:
                conn.execute("ALTER TABLE oauth_states ADD COLUMN session_hash TEXT")

    def save(self, token: SpotifyToken) -> None:
        """Save or update a token."""
        now = datetime.now(timezone.utc).isoformat()
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()

            # Check if token exists
            cursor.execute("SELECT user_id FROM auth_tokens WHERE user_id = ?", (token.user_id,))
            exists = cursor.fetchone() is not None

            if exists:
                cursor.execute(
                    """UPDATE auth_tokens
                       SET access_token = ?, refresh_token = ?, token_type = ?,
                           expires_at = ?, scope = ?, updated_at = ?
                       WHERE user_id = ?""",
                    (
                        token.access_token,
                        token.refresh_token,
                        token.token_type,
                        token.expires_at,
                        token.scope,
                        now,
                        token.user_id,
                    ),
                )
            else:
                cursor.execute(
                    """INSERT INTO auth_tokens
                       (user_id, access_token, refresh_token, token_type,
                        expires_at, scope, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        token.user_id,
                        token.access_token,
                        token.refresh_token,
                        token.token_type,
                        token.expires_at,
                        token.scope,
                        now,
                        now,
                    ),
                )

            conn.commit()

    def get(self, user_id: str) -> SpotifyToken | None:
        """Retrieve token by user_id. Returns None if not found."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute("SELECT * FROM auth_tokens WHERE user_id = ?", (user_id,))
            row = cursor.fetchone()

            if row is None:
                return None

            return SpotifyToken(
                user_id=row["user_id"],
                access_token=row["access_token"],
                refresh_token=row["refresh_token"],
                token_type=row["token_type"],
                expires_at=row["expires_at"],
                scope=row["scope"],
            )

    def delete(self, user_id: str) -> None:
        """Delete a token."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM auth_tokens WHERE user_id = ?", (user_id,))
            conn.commit()

    def get_default(self) -> SpotifyToken | None:
        """Get the most recently updated token (for single-user apps)."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute("SELECT * FROM auth_tokens ORDER BY updated_at DESC LIMIT 1")
            row = cursor.fetchone()

            if row is None:
                return None

            return SpotifyToken(
                user_id=row["user_id"],
                access_token=row["access_token"],
                refresh_token=row["refresh_token"],
                token_type=row["token_type"],
                expires_at=row["expires_at"],
                scope=row["scope"],
            )

    @staticmethod
    def _session_hash(session_id: str) -> str:
        return hashlib.sha256(session_id.encode()).hexdigest()

    def save_oauth_state(self, state: str, verifier: str, session_id: str) -> None:
        """Persist a one-time PKCE verifier bound to one opaque browser session."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO oauth_states (state, verifier, session_hash, created_at) "
                "VALUES (?, ?, ?, ?)",
                (
                    state,
                    verifier,
                    self._session_hash(session_id),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            conn.commit()

    def consume_oauth_state(self, state: str | None, session_id: str | None) -> str | None:
        """Atomically consume a non-expired state only from its original session."""
        if not state or not session_id:
            return None
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                "SELECT verifier, session_hash, created_at FROM oauth_states WHERE state = ?",
                (state,),
            ).fetchone()
            if row is None:
                conn.rollback()
                return None
            if not row[1] or not hmac.compare_digest(str(row[1]), self._session_hash(session_id)):
                conn.rollback()
                return None
            created_at = datetime.fromisoformat(str(row[2])).timestamp()
            if time.time() - created_at > self.OAUTH_STATE_TTL_SECONDS:
                conn.execute("DELETE FROM oauth_states WHERE state = ?", (state,))
                conn.commit()
                return None
            conn.execute("DELETE FROM oauth_states WHERE state = ?", (state,))
            conn.commit()
            return str(row[0])

    def clear_oauth_states(self, session_id: str | None) -> None:
        if not session_id:
            return
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "DELETE FROM oauth_states WHERE session_hash = ?",
                (self._session_hash(session_id),),
            )
            conn.commit()

    def create_session(self, user_id: str = "default", max_age: int = 30 * 24 * 60 * 60) -> str:
        """Create an opaque browser session and store only its hash."""
        session_id = secrets.token_urlsafe(32)
        session_hash = hashlib.sha256(session_id.encode()).hexdigest()
        now = int(time.time())
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO auth_sessions (session_hash, user_id, created_at, expires_at) "
                "VALUES (?, ?, ?, ?)",
                (session_hash, user_id, datetime.now(timezone.utc).isoformat(), now + max_age),
            )
            conn.commit()
        return session_id

    def rotate_session(self, session_id: str, max_age: int = 30 * 24 * 60 * 60) -> str:
        """Rotate a session while preserving its pending OAuth states."""
        new_session = secrets.token_urlsafe(32)
        old_hash = self._session_hash(session_id)
        new_hash = self._session_hash(new_session)
        now = int(time.time())
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            user = conn.execute(
                "SELECT user_id FROM auth_sessions WHERE session_hash = ?",
                (old_hash,),
            ).fetchone()
            if user is None:
                conn.rollback()
                raise ValueError("session is not active")
            conn.execute(
                "INSERT INTO auth_sessions (session_hash, user_id, created_at, expires_at) "
                "VALUES (?, ?, ?, ?)",
                (new_hash, user[0], datetime.now(timezone.utc).isoformat(), now + max_age),
            )
            conn.execute(
                "UPDATE oauth_states SET session_hash = ? WHERE session_hash = ?",
                (new_hash, old_hash),
            )
            conn.execute("DELETE FROM auth_sessions WHERE session_hash = ?", (old_hash,))
            conn.commit()
        return new_session

    def get_session_user(self, session_id: str | None) -> str | None:
        """Return the session user when the opaque cookie is present and unexpired."""
        if not session_id:
            return None
        session_hash = hashlib.sha256(session_id.encode()).hexdigest()
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT user_id FROM auth_sessions WHERE session_hash = ? AND expires_at > ?",
                (session_hash, int(time.time())),
            ).fetchone()
        return str(row[0]) if row else None

    def delete_session(self, session_id: str | None) -> None:
        if not session_id:
            return
        session_hash = hashlib.sha256(session_id.encode()).hexdigest()
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM auth_sessions WHERE session_hash = ?", (session_hash,))
            conn.commit()
