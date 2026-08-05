from __future__ import annotations

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
