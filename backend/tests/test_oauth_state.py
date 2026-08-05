"""Tests for the persistent, bounded, expiring OAuth state store."""

from __future__ import annotations

from pathlib import Path

import pytest

from music_quiz.auth import AuthState
from music_quiz.oauth_state import OAuthStateStore


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def state(name: str) -> AuthState:
    return AuthState(name, f"verifier-{name}")


def store(tmp_path: Path, clock: FakeClock | None = None, **kwargs: object) -> OAuthStateStore:
    return OAuthStateStore(
        str(tmp_path / "oauth-state.db"),
        clock=clock or FakeClock(),
        **kwargs,
    )


def test_round_trip_returns_the_stored_state(tmp_path: Path) -> None:
    oauth = store(tmp_path)
    oauth.put(state("abc"))

    consumed = oauth.consume("abc")

    assert consumed is not None
    assert consumed.verifier == "verifier-abc"


def test_state_can_only_be_consumed_once(tmp_path: Path) -> None:
    oauth = store(tmp_path)
    oauth.put(state("abc"))

    assert oauth.consume("abc") is not None
    assert oauth.consume("abc") is None, "replaying a state must fail"


def test_unknown_and_empty_states_are_rejected(tmp_path: Path) -> None:
    oauth = store(tmp_path)

    assert oauth.consume("never-issued") is None
    assert oauth.consume(None) is None
    assert oauth.consume("") is None


def test_state_expires_after_the_ttl(tmp_path: Path) -> None:
    clock = FakeClock()
    oauth = store(tmp_path, clock, ttl_seconds=600)
    oauth.put(state("abc"))

    clock.advance(599)
    assert oauth.consume("abc") is not None

    oauth.put(state("def"))
    clock.advance(600)
    assert oauth.consume("def") is None


def test_expired_entries_are_purged_so_the_store_does_not_grow(tmp_path: Path) -> None:
    clock = FakeClock()
    oauth = store(tmp_path, clock, ttl_seconds=10, max_pending=100)
    for i in range(10):
        oauth.put(state(f"s{i}"))
    assert len(oauth) == 10

    clock.advance(11)
    oauth.put(state("fresh"))

    assert len(oauth) == 1


def test_store_is_bounded_and_evicts_oldest_first(tmp_path: Path) -> None:
    oauth = store(tmp_path, max_pending=3)
    for i in range(5):
        oauth.put(state(f"s{i}"))

    assert len(oauth) == 3
    assert oauth.consume("s0") is None
    assert oauth.consume("s1") is None
    assert oauth.consume("s4") is not None


def test_pending_state_survives_store_recreation(tmp_path: Path) -> None:
    """Regression: uvicorn reloads must not invalidate an in-flight login."""
    db_path = str(tmp_path / "oauth-state.db")
    clock = FakeClock()
    first_process = OAuthStateStore(db_path, clock=clock)
    first_process.put(state("survives-reload"))

    reloaded_process = OAuthStateStore(db_path, clock=clock)

    consumed = reloaded_process.consume("survives-reload")
    assert consumed == state("survives-reload")
    assert first_process.consume("survives-reload") is None


def test_two_store_instances_cannot_consume_the_same_state(tmp_path: Path) -> None:
    db_path = str(tmp_path / "oauth-state.db")
    first = OAuthStateStore(db_path, clock=FakeClock())
    second = OAuthStateStore(db_path, clock=FakeClock())
    first.put(state("shared"))

    assert first.consume("shared") is not None
    assert second.consume("shared") is None


@pytest.mark.parametrize(("ttl", "cap"), [(0, 5), (-1, 5), (600, 0)])
def test_invalid_configuration_is_rejected(tmp_path: Path, ttl: float, cap: int) -> None:
    with pytest.raises(ValueError):
        OAuthStateStore(
            str(tmp_path / "oauth-state.db"),
            clock=FakeClock(),
            ttl_seconds=ttl,
            max_pending=cap,
        )
