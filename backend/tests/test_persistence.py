from __future__ import annotations

import tempfile
from pathlib import Path
from uuid import uuid4

import pytest

from music_quiz.domain.game import (
    ExcerptMode,
    Game,
    GameConfig,
    GameStatus,
    Participant,
    Round,
    Track,
)
from music_quiz.persistence.sqlite import SQLiteGameRepository


@pytest.fixture
def temp_db() -> str:
    """Create a temporary database file."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as f:
        db_path = f.name
    yield db_path
    Path(db_path).unlink(missing_ok=True)


@pytest.fixture
def repo(temp_db: str) -> SQLiteGameRepository:
    """Create a repository with temporary database."""
    return SQLiteGameRepository(temp_db)


@pytest.fixture
def sample_game() -> Game:
    """Create a sample game for testing."""
    config = GameConfig(rounds=3, excerpt_seconds=10, mode=ExcerptMode.RANDOM)
    track1 = Track(
        uri="spotify:track:1",
        title="Test Song 1",
        artists=("Artist A",),
        album="Album X",
        duration_ms=180000,
    )
    track2 = Track(
        uri="spotify:track:2",
        title="Test Song 2",
        artists=("Artist B", "Artist C"),
        album="Album Y",
        duration_ms=200000,
    )
    track3 = Track(
        uri="spotify:track:3",
        title="Test Song 3",
        artists=("Artist D",),
        album="Album Z",
        duration_ms=220000,
        explicit=True,
        image_url="https://example.com/image.jpg",
    )
    queue = (
        Round(1, track1, 15000),
        Round(2, track2, 20000),
        Round(3, track3, 25000),
    )
    participants = [
        Participant(uuid4(), "Team A", 0),
        Participant(uuid4(), "Team B", 0),
    ]
    return Game(
        id=uuid4(),
        config=config,
        queue=queue,
        participants=participants,
        status=GameStatus.READY,
    )


def test_save_and_retrieve_game(repo: SQLiteGameRepository, sample_game: Game) -> None:
    """Test saving and retrieving a game."""
    repo.save(sample_game)
    retrieved = repo.get(sample_game.id)

    assert retrieved.id == sample_game.id
    assert retrieved.status == sample_game.status
    assert retrieved.current_index == sample_game.current_index
    assert len(retrieved.queue) == len(sample_game.queue)
    assert len(retrieved.participants) == len(sample_game.participants)

    # Verify config
    assert retrieved.config.rounds == sample_game.config.rounds
    assert retrieved.config.excerpt_seconds == sample_game.config.excerpt_seconds
    assert retrieved.config.mode == sample_game.config.mode

    # Verify queue
    for r1, r2 in zip(retrieved.queue, sample_game.queue, strict=True):
        assert r1.number == r2.number
        assert r1.track.uri == r2.track.uri
        assert r1.track.title == r2.track.title
        assert r1.track.artists == r2.track.artists
        assert r1.excerpt_start_ms == r2.excerpt_start_ms

    # Verify participants
    for p1, p2 in zip(retrieved.participants, sample_game.participants, strict=True):
        assert p1.id == p2.id
        assert p1.name == p2.name
        assert p1.score == p2.score


def test_update_game_state(repo: SQLiteGameRepository, sample_game: Game) -> None:
    """Test updating game state."""
    repo.save(sample_game)

    # Progress game
    sample_game.start()
    repo.save(sample_game)

    retrieved = repo.get(sample_game.id)
    assert retrieved.status == GameStatus.PLAYING

    # Progress to next round
    sample_game.reveal()
    sample_game.next_round()
    repo.save(sample_game)

    retrieved = repo.get(sample_game.id)
    assert retrieved.status == GameStatus.READY
    assert retrieved.current_index == 1


def test_game_with_scoring(repo: SQLiteGameRepository, sample_game: Game) -> None:
    """Test game with score events."""
    repo.save(sample_game)

    # Play and score
    sample_game.start()
    sample_game.reveal()
    participant_id = sample_game.participants[0].id
    event = sample_game.add_score(participant_id, 2, "title + artist")
    repo.save(sample_game)

    retrieved = repo.get(sample_game.id)
    assert len(retrieved.score_events) == 1
    assert retrieved.score_events[0].id == event.id
    assert retrieved.score_events[0].points == 2
    assert retrieved.score_events[0].reason == "title + artist"
    assert retrieved.participants[0].score == 2


def test_reverse_score_persists(repo: SQLiteGameRepository, sample_game: Game) -> None:
    """Test that reversed score events persist."""
    repo.save(sample_game)

    sample_game.start()
    sample_game.reveal()
    participant_id = sample_game.participants[0].id
    event = sample_game.add_score(participant_id, 2, "title + artist")
    sample_game.reverse_score(event.id)
    repo.save(sample_game)

    retrieved = repo.get(sample_game.id)
    assert len(retrieved.score_events) == 1
    assert retrieved.score_events[0].reversed is True
    assert retrieved.participants[0].score == 0


def test_list_games(repo: SQLiteGameRepository, sample_game: Game) -> None:
    """Test listing all games."""
    game1 = sample_game
    game2 = Game(
        id=uuid4(),
        config=sample_game.config,
        queue=sample_game.queue,
        participants=[Participant(uuid4(), "Solo", 0)],
    )

    repo.save(game1)
    repo.save(game2)

    games = repo.list()
    assert len(games) == 2
    game_ids = {g.id for g in games}
    assert game1.id in game_ids
    assert game2.id in game_ids


def test_delete_game(repo: SQLiteGameRepository, sample_game: Game) -> None:
    """Test deleting a game."""
    repo.save(sample_game)
    repo.delete(sample_game.id)

    with pytest.raises(KeyError):
        repo.get(sample_game.id)


def test_delete_nonexistent_game(repo: SQLiteGameRepository) -> None:
    """Test deleting a game that doesn't exist."""
    with pytest.raises(KeyError):
        repo.delete(uuid4())


def test_get_nonexistent_game(repo: SQLiteGameRepository) -> None:
    """Test retrieving a game that doesn't exist."""
    with pytest.raises(KeyError):
        repo.get(uuid4())


def test_database_survives_restart(temp_db: str, sample_game: Game) -> None:
    """Test that games persist across repository instances."""
    repo1 = SQLiteGameRepository(temp_db)
    repo1.save(sample_game)

    # Create new repository instance (simulating restart)
    repo2 = SQLiteGameRepository(temp_db)
    retrieved = repo2.get(sample_game.id)

    assert retrieved.id == sample_game.id
    assert retrieved.status == sample_game.status
    assert len(retrieved.queue) == len(sample_game.queue)


def test_cascade_delete_participants_and_events(
    repo: SQLiteGameRepository, sample_game: Game
) -> None:
    """Test that deleting a game cascades to participants and score events."""
    repo.save(sample_game)
    sample_game.start()
    sample_game.reveal()
    sample_game.add_score(sample_game.participants[0].id, 1, "test")
    repo.save(sample_game)

    repo.delete(sample_game.id)

    # Verify deletion cascaded
    import sqlite3

    with sqlite3.connect(repo.db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM participants WHERE game_id = ?", (str(sample_game.id),)
        )
        assert cursor.fetchone()[0] == 0
        cursor.execute(
            "SELECT COUNT(*) FROM score_events WHERE game_id = ?", (str(sample_game.id),)
        )
        assert cursor.fetchone()[0] == 0
