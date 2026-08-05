from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID, uuid4

from music_quiz.domain.game import Game, GameConfig, Participant, build_queue, normalize_tracks
from music_quiz.persistence.repository import GameRepository
from music_quiz.spotify.fake import SpotifyCatalog


@dataclass
class QuizService:
    catalog: SpotifyCatalog
    repository: GameRepository

    def create(
        self,
        playlist_id: str,
        config: GameConfig,
        names: list[str],
        seed: int | None = None,
        catalog: SpotifyCatalog | None = None,
    ) -> Game:
        source = catalog or self.catalog
        tracks = normalize_tracks(source.playlist_items(playlist_id), config)
        queue = build_queue(tracks, config, seed)
        game = Game(uuid4(), config, queue, [Participant(uuid4(), name) for name in names])
        self.repository.save(game)
        return game

    def get(self, game_id: UUID) -> Game:
        return self.repository.get(game_id)
