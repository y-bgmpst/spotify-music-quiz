from random import Random
from uuid import uuid4

import pytest

from music_quiz.domain.game import (
    DomainError,
    ExcerptMode,
    GameConfig,
    GameStatus,
    Track,
    build_queue,
    excerpt_start_ms,
    normalize_tracks,
)


def track(ms: int = 240_000) -> Track:
    return Track("spotify:track:1", "Song", ("Artist",), "Album", ms)


def test_random_excerpt_respects_bounds_and_seed() -> None:
    config = GameConfig(excerpt_seconds=10, intro_guard_seconds=15, outro_guard_seconds=20)
    start = excerpt_start_ms(track(), config, Random(4))
    assert 15_000 <= start <= 210_000
    assert start == excerpt_start_ms(track(), config, Random(4))


def test_short_track_is_rejected() -> None:
    with pytest.raises(DomainError):
        excerpt_start_ms(track(10_000), GameConfig(), Random(1))


def test_normalization_deduplicates_and_skips_malformed() -> None:
    items = [
        {
            "uri": "spotify:track:1",
            "title": "A",
            "artists": ["X"],
            "album": "A",
            "duration_ms": 240000,
        },
        {
            "uri": "spotify:track:1",
            "title": "A",
            "artists": ["X"],
            "album": "A",
            "duration_ms": 240000,
        },
        {
            "uri": "spotify:episode:1",
            "title": "E",
            "artists": ["X"],
            "album": "A",
            "duration_ms": 240000,
        },
        {},
    ]
    assert len(normalize_tracks(items, GameConfig())) == 1


def test_queue_is_deterministic_and_non_repeating() -> None:
    tracks = [Track(f"spotify:track:{i}", str(i), ("A",), "B", 240000) for i in range(5)]
    config = GameConfig(rounds=5, mode=ExcerptMode.INTRO)
    left = build_queue(tracks, config, 7)
    right = build_queue(tracks, config, 7)
    assert [r.track.uri for r in left] == [r.track.uri for r in right]
    assert len({r.track.uri for r in left}) == 5


def test_lifecycle_and_score_reversal() -> None:
    from music_quiz.domain.game import Game, Participant

    participant = Participant(uuid4(), "A")
    game = Game(
        uuid4(),
        GameConfig(rounds=1, mode=ExcerptMode.INTRO),
        build_queue([track()], GameConfig(rounds=1, mode=ExcerptMode.INTRO), 1),
        [participant],
    )
    game.start()
    assert game.status is GameStatus.PLAYING
    game.reveal()
    event = game.add_score(participant.id, 2, "title")
    assert participant.score == 2
    game.reverse_score(event.id)
    assert participant.score == 0
    game.next_round()
    assert game.status is GameStatus.FINISHED
