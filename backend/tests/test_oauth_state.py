"""Tests for the bounded, expiring, one-time-use OAuth state store."""

from __future__ import annotations

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


def test_round_trip_returns_the_stored_state() -> None:
    clock = FakeClock()
    store = OAuthStateStore(clock=clock)
    store.put(state("abc"))

    consumed = store.consume("abc")

    assert consumed is not None
    assert consumed.verifier == "verifier-abc"


def test_state_can_only_be_consumed_once() -> None:
    store = OAuthStateStore(clock=FakeClock())
    store.put(state("abc"))

    assert store.consume("abc") is not None
    assert store.consume("abc") is None, "replaying a state must fail"


def test_unknown_and_empty_states_are_rejected() -> None:
    store = OAuthStateStore(clock=FakeClock())

    assert store.consume("never-issued") is None
    assert store.consume(None) is None
    assert store.consume("") is None


def test_state_expires_after_the_ttl() -> None:
    clock = FakeClock()
    store = OAuthStateStore(clock=clock, ttl_seconds=600)
    store.put(state("abc"))

    clock.advance(599)
    assert store.consume("abc") is not None

    store.put(state("def"))
    clock.advance(600)
    assert store.consume("def") is None


def test_expired_entries_are_purged_so_the_store_does_not_grow() -> None:
    clock = FakeClock()
    store = OAuthStateStore(clock=clock, ttl_seconds=10, max_pending=100)
    for i in range(10):
        store.put(state(f"s{i}"))
    assert len(store) == 10

    clock.advance(11)
    store.put(state("fresh"))

    assert len(store) == 1


def test_store_is_bounded_and_evicts_oldest_first() -> None:
    store = OAuthStateStore(clock=FakeClock(), ttl_seconds=600, max_pending=3)
    for i in range(5):
        store.put(state(f"s{i}"))

    assert len(store) == 3
    assert store.consume("s0") is None
    assert store.consume("s1") is None
    assert store.consume("s4") is not None


@pytest.mark.parametrize(("ttl", "cap"), [(0, 5), (-1, 5), (600, 0)])
def test_invalid_configuration_is_rejected(ttl: float, cap: int) -> None:
    with pytest.raises(ValueError):
        OAuthStateStore(clock=FakeClock(), ttl_seconds=ttl, max_pending=cap)
