import tempfile
from pathlib import Path

from music_quiz.domain.game import ExcerptMode, GameConfig, GameStatus
from music_quiz.persistence.sqlite import SQLiteGameRepository
from music_quiz.services import QuizService
from music_quiz.spotify.fake import FakeSpotifyCatalog


def test_service_creates_authoritative_fake_game() -> None:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as f:
        db_path = f.name
    try:
        repo = SQLiteGameRepository(db_path)
        service = QuizService(FakeSpotifyCatalog(), repo)
        game = service.create(
            "fake-playlist", GameConfig(rounds=2, mode=ExcerptMode.INTRO), ["Host"], seed=4
        )
        assert game.status is GameStatus.READY
        assert len(game.queue) == 2
        assert len({round_.track.uri for round_ in game.queue}) == 2
        assert service.get(game.id).id == game.id
    finally:
        Path(db_path).unlink(missing_ok=True)
