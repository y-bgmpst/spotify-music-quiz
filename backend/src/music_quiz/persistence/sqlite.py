from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from music_quiz.domain.game import (
    ExcerptMode,
    Game,
    GameConfig,
    GameStatus,
    Participant,
    Round,
    ScoreEvent,
    Track,
)


class SQLiteGameRepository:
    """SQLite implementation of GameRepository."""

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        """Create database and apply schema if needed."""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        schema_path = Path(__file__).parent / "schema.sql"
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            conn.executescript(schema_path.read_text())

    def save(self, game: Game) -> None:
        """Save or update a game."""
        now = datetime.now(timezone.utc).isoformat()
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()

            # Check if game exists
            cursor.execute("SELECT id FROM games WHERE id = ?", (str(game.id),))
            exists = cursor.fetchone() is not None

            config_json = json.dumps(
                {
                    "rounds": game.config.rounds,
                    "excerpt_seconds": game.config.excerpt_seconds,
                    "mode": game.config.mode,
                    "intro_guard_seconds": game.config.intro_guard_seconds,
                    "outro_guard_seconds": game.config.outro_guard_seconds,
                    "exclude_explicit": game.config.exclude_explicit,
                    "title_points": game.config.title_points,
                    "artist_points": game.config.artist_points,
                    "time_limit_seconds": game.config.time_limit_seconds,
                }
            )

            queue_json = json.dumps(
                [
                    {
                        "number": r.number,
                        "track": {
                            "uri": r.track.uri,
                            "title": r.track.title,
                            "artists": list(r.track.artists),
                            "album": r.track.album,
                            "duration_ms": r.track.duration_ms,
                            "explicit": r.track.explicit,
                            "image_url": r.track.image_url,
                        },
                        "excerpt_start_ms": r.excerpt_start_ms,
                    }
                    for r in game.queue
                ]
            )

            if exists:
                cursor.execute(
                    """UPDATE games
                       SET config_json = ?, queue_json = ?, status = ?,
                           current_index = ?, updated_at = ?
                       WHERE id = ?""",
                    (config_json, queue_json, game.status, game.current_index, now, str(game.id)),
                )
            else:
                cursor.execute(
                    """INSERT INTO games
                       (id, config_json, queue_json, status, current_index, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        str(game.id),
                        config_json,
                        queue_json,
                        game.status,
                        game.current_index,
                        now,
                        now,
                    ),
                )

            # Delete existing participants and score events
            cursor.execute("DELETE FROM participants WHERE game_id = ?", (str(game.id),))
            cursor.execute("DELETE FROM score_events WHERE game_id = ?", (str(game.id),))

            # Insert participants
            for p in game.participants:
                cursor.execute(
                    """INSERT INTO participants (id, game_id, name, score)
                       VALUES (?, ?, ?, ?)""",
                    (str(p.id), str(game.id), p.name, p.score),
                )

            # Insert score events
            for e in game.score_events:
                cursor.execute(
                    """INSERT INTO score_events
                       (id, game_id, participant_id, points, reason, reversed, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        str(e.id),
                        str(game.id),
                        str(e.participant_id),
                        e.points,
                        e.reason,
                        int(e.reversed),
                        now,
                    ),
                )

            conn.commit()

    def get(self, game_id: UUID) -> Game:
        """Retrieve a game by ID. Raises KeyError if not found."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute("SELECT * FROM games WHERE id = ?", (str(game_id),))
            row = cursor.fetchone()
            if row is None:
                raise KeyError(f"Game {game_id} not found")

            config_data = json.loads(row["config_json"])
            config = GameConfig(
                rounds=config_data["rounds"],
                excerpt_seconds=config_data["excerpt_seconds"],
                mode=ExcerptMode(config_data["mode"]),
                intro_guard_seconds=config_data["intro_guard_seconds"],
                outro_guard_seconds=config_data["outro_guard_seconds"],
                exclude_explicit=config_data["exclude_explicit"],
                title_points=config_data["title_points"],
                artist_points=config_data["artist_points"],
                time_limit_seconds=config_data.get("time_limit_seconds"),
            )

            queue_data = json.loads(row["queue_json"])
            queue = tuple(
                Round(
                    number=r["number"],
                    track=Track(
                        uri=r["track"]["uri"],
                        title=r["track"]["title"],
                        artists=tuple(r["track"]["artists"]),
                        album=r["track"]["album"],
                        duration_ms=r["track"]["duration_ms"],
                        explicit=r["track"]["explicit"],
                        image_url=r["track"]["image_url"],
                    ),
                    excerpt_start_ms=r["excerpt_start_ms"],
                )
                for r in queue_data
            )

            cursor.execute("SELECT * FROM participants WHERE game_id = ?", (str(game_id),))
            participants = [
                Participant(
                    id=UUID(p["id"]),
                    name=p["name"],
                    score=p["score"],
                )
                for p in cursor.fetchall()
            ]

            cursor.execute("SELECT * FROM score_events WHERE game_id = ?", (str(game_id),))
            score_events = [
                ScoreEvent(
                    id=UUID(e["id"]),
                    participant_id=UUID(e["participant_id"]),
                    points=e["points"],
                    reason=e["reason"],
                    reversed=bool(e["reversed"]),
                )
                for e in cursor.fetchall()
            ]

            return Game(
                id=UUID(row["id"]),
                config=config,
                queue=queue,
                participants=participants,
                status=GameStatus(row["status"]),
                current_index=row["current_index"],
                score_events=score_events,
            )

    def list(self) -> list[Game]:
        """List all games."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM games")
            game_ids = [UUID(row[0]) for row in cursor.fetchall()]
            return [self.get(game_id) for game_id in game_ids]

    def delete(self, game_id: UUID) -> None:
        """Delete a game. Raises KeyError if not found."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()

            # Enable foreign key constraints
            cursor.execute("PRAGMA foreign_keys = ON")

            # Check if game exists
            cursor.execute("SELECT id FROM games WHERE id = ?", (str(game_id),))
            if cursor.fetchone() is None:
                raise KeyError(f"Game {game_id} not found")

            # Delete game (cascades to participants and score_events)
            cursor.execute("DELETE FROM games WHERE id = ?", (str(game_id),))
            conn.commit()
