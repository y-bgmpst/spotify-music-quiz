from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from random import Random
from typing import Iterable
from uuid import UUID, uuid4


class DomainError(ValueError):
    pass


class GameStatus(StrEnum):
    SETUP = "setup"
    READY = "ready"
    PLAYING = "playing"
    PAUSED = "paused"
    REVEALED = "revealed"
    FINISHED = "finished"


class ExcerptMode(StrEnum):
    INTRO = "intro"
    RANDOM = "random"


@dataclass(frozen=True)
class Track:
    uri: str
    title: str
    artists: tuple[str, ...]
    album: str
    duration_ms: int
    explicit: bool = False
    image_url: str | None = None


@dataclass(frozen=True)
class GameConfig:
    rounds: int = 10
    excerpt_seconds: int = 10
    mode: ExcerptMode = ExcerptMode.RANDOM
    intro_guard_seconds: int = 15
    outro_guard_seconds: int = 20
    exclude_explicit: bool = False
    title_points: int = 1
    artist_points: int = 1
    time_limit_seconds: int | None = None  # Optional quiz time limit (5min=300, 10min=600)

    def __post_init__(self) -> None:
        if self.rounds < 1 or self.excerpt_seconds < 1:
            raise DomainError("rounds and excerpt_seconds must be positive")
        if (
            min(
                self.intro_guard_seconds,
                self.outro_guard_seconds,
                self.title_points,
                self.artist_points,
            )
            < 0
        ):
            raise DomainError("guards and point values cannot be negative")
        if self.time_limit_seconds is not None and self.time_limit_seconds < 1:
            raise DomainError("time_limit_seconds must be positive or None")


@dataclass
class Participant:
    id: UUID
    name: str
    score: int = 0


@dataclass
class ScoreEvent:
    id: UUID
    participant_id: UUID
    points: int
    reason: str
    reversed: bool = False


@dataclass
class Round:
    number: int
    track: Track
    excerpt_start_ms: int


def excerpt_start_ms(track: Track, config: GameConfig, rng: Random) -> int:
    duration = track.duration_ms
    excerpt = config.excerpt_seconds * 1000
    if duration < excerpt:
        raise DomainError("track is too short for excerpt")
    if config.mode is ExcerptMode.INTRO:
        return 0
    low = config.intro_guard_seconds * 1000
    high = duration - config.outro_guard_seconds * 1000 - excerpt
    if high < low:
        raise DomainError("track is too short for configured guards")
    return rng.randint(low, high)


def normalize_tracks(items: Iterable[object], config: GameConfig) -> tuple[Track, ...]:
    result: list[Track] = []
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        uri = item.get("uri")
        if not isinstance(uri, str) or not uri.startswith("spotify:track:") or uri in seen:
            continue
        duration = item.get("duration_ms")
        title = item.get("title")
        artists = item.get("artists")
        album = item.get("album")
        if (
            not isinstance(duration, int)
            or duration < 1
            or not isinstance(title, str)
            or not isinstance(album, str)
        ):
            continue
        if (
            not isinstance(artists, list)
            or not artists
            or not all(isinstance(a, str) for a in artists)
        ):
            continue
        if config.exclude_explicit and item.get("explicit") is True:
            continue
        track = Track(
            uri,
            title,
            tuple(artists),
            album,
            duration,
            bool(item.get("explicit")),
            item.get("image_url"),
        )
        try:
            excerpt_start_ms(track, config, Random(0))
        except DomainError:
            continue
        seen.add(uri)
        result.append(track)
    return tuple(result)


def build_queue(
    tracks: Iterable[Track], config: GameConfig, seed: int | None = None
) -> tuple[Round, ...]:
    ordered = list(tracks)
    if config.rounds > len(ordered):
        raise DomainError("requested rounds exceed eligible tracks")
    Random(seed).shuffle(ordered)
    return tuple(
        Round(i + 1, track, excerpt_start_ms(track, config, Random((seed or 0) + i)))
        for i, track in enumerate(ordered[: config.rounds])
    )


@dataclass
class Game:
    id: UUID
    config: GameConfig
    queue: tuple[Round, ...]
    participants: list[Participant]
    status: GameStatus = GameStatus.READY
    current_index: int = 0
    score_events: list[ScoreEvent] = field(default_factory=list)

    @property
    def current_round(self) -> Round:
        if self.current_index >= len(self.queue):
            raise DomainError("game has no current round")
        return self.queue[self.current_index]

    def start(self) -> None:
        if self.status is not GameStatus.READY:
            raise DomainError(f"cannot start from {self.status}")
        self.status = GameStatus.PLAYING

    def pause(self) -> None:
        if self.status is not GameStatus.PLAYING:
            raise DomainError("only a playing round can pause")
        self.status = GameStatus.PAUSED

    def resume(self) -> None:
        if self.status is not GameStatus.PAUSED:
            raise DomainError("only a paused round can resume")
        self.status = GameStatus.PLAYING

    def reveal(self) -> None:
        if self.status not in (GameStatus.PLAYING, GameStatus.PAUSED):
            raise DomainError("only an active round can reveal")
        self.status = GameStatus.REVEALED

    def next_round(self) -> None:
        if self.status is not GameStatus.REVEALED:
            raise DomainError("round must be revealed before advancing")
        self.current_index += 1
        self.status = (
            GameStatus.FINISHED if self.current_index >= len(self.queue) else GameStatus.READY
        )

    def add_score(
        self, participant_id: UUID, points: int, reason: str, event_id: UUID | None = None
    ) -> ScoreEvent:
        if self.status is not GameStatus.REVEALED:
            raise DomainError("scoring is available after reveal")
        if not any(p.id == participant_id for p in self.participants):
            raise DomainError("unknown participant")
        if points == 0:
            raise DomainError("score adjustment cannot be zero")
        if event_id and any(e.id == event_id for e in self.score_events):
            return next(e for e in self.score_events if e.id == event_id)
        event = ScoreEvent(event_id or uuid4(), participant_id, points, reason)
        self.score_events.append(event)
        self._recalculate_scores()
        return event

    def reverse_score(self, event_id: UUID) -> None:
        event = next((e for e in self.score_events if e.id == event_id), None)
        if event is None or event.reversed:
            raise DomainError("score event is missing or already reversed")
        event.reversed = True
        self._recalculate_scores()

    def _recalculate_scores(self) -> None:
        totals = {p.id: 0 for p in self.participants}
        for event in self.score_events:
            if not event.reversed:
                totals[event.participant_id] += event.points
        for participant in self.participants:
            participant.score = totals[participant.id]
