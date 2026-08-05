from __future__ import annotations

from typing import Protocol
from uuid import UUID

from music_quiz.domain.game import Game


class GameRepository(Protocol):
    """Protocol for game persistence operations."""

    def save(self, game: Game) -> None:
        """Save or update a game."""
        ...

    def get(self, game_id: UUID) -> Game:
        """Retrieve a game by ID. Raises KeyError if not found."""
        ...

    def list(self) -> list[Game]:
        """List all games."""
        ...

    def delete(self, game_id: UUID) -> None:
        """Delete a game. Raises KeyError if not found."""
        ...
