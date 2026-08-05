"""Bounded, expiring, one-time-use OAuth state store.

Scope and consequences (local-first MVP):

- The store is process-local. Restarting the backend invalidates every pending
  OAuth callback; the host must start the login flow again.
- Running multiple backend processes (or workers) is unsupported, because a
  callback may be routed to a process that does not hold the state. A shared
  store would be required first.

The store is deliberately small: TTL, a hard capacity bound, one-time
consumption, and an injectable clock so tests do not sleep.
"""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from typing import Callable

from music_quiz.auth import AuthState

DEFAULT_TTL_SECONDS = 600
DEFAULT_MAX_PENDING = 32


@dataclass(frozen=True)
class PendingState:
    auth: AuthState
    created_at: float

    def is_expired(self, now: float, ttl_seconds: float) -> bool:
        return now - self.created_at >= ttl_seconds


class OAuthStateStore:
    """Stores pending OAuth states with TTL, bounds and one-time consumption."""

    def __init__(
        self,
        clock: Callable[[], float],
        ttl_seconds: float = DEFAULT_TTL_SECONDS,
        max_pending: int = DEFAULT_MAX_PENDING,
    ) -> None:
        if ttl_seconds <= 0:
            raise ValueError("ttl_seconds must be positive")
        if max_pending < 1:
            raise ValueError("max_pending must be at least 1")
        self._clock = clock
        self._ttl_seconds = ttl_seconds
        self._max_pending = max_pending
        self._pending: OrderedDict[str, PendingState] = OrderedDict()

    def __len__(self) -> int:
        return len(self._pending)

    @property
    def max_pending(self) -> int:
        return self._max_pending

    def put(self, auth: AuthState) -> None:
        """Register a pending state, evicting expired and then oldest entries."""
        now = self._clock()
        self.purge_expired()
        # Bound the store: drop the oldest pending logins first.
        while len(self._pending) >= self._max_pending:
            self._pending.popitem(last=False)
        self._pending[auth.state] = PendingState(auth=auth, created_at=now)

    def consume(self, state: str | None) -> AuthState | None:
        """Return the state exactly once. Unknown, replayed or expired -> None."""
        self.purge_expired()
        if not state:
            return None
        pending = self._pending.pop(state, None)
        if pending is None:
            return None
        if pending.is_expired(self._clock(), self._ttl_seconds):
            return None
        return pending.auth

    def purge_expired(self) -> int:
        now = self._clock()
        expired = [
            key
            for key, pending in self._pending.items()
            if pending.is_expired(now, self._ttl_seconds)
        ]
        for key in expired:
            del self._pending[key]
        return len(expired)

    def clear(self) -> None:
        self._pending.clear()
