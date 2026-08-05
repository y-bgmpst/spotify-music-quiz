from __future__ import annotations

import logging
import os
import secrets
from uuid import UUID

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from music_quiz.auth import AuthState, authorization_url
from music_quiz.auth_service import SpotifyAuthService, TokenRefreshError
from music_quiz.config import Settings, load_settings
from music_quiz.domain.game import DomainError, ExcerptMode, Game, GameConfig, GameStatus
from music_quiz.errors import AppError, register_error_handlers
from music_quiz.oauth_state import OAuthStateStore
from music_quiz.persistence.sqlite import SQLiteGameRepository
from music_quiz.persistence.tokens import SpotifyToken, TokenRepository
from music_quiz.services import QuizService
from music_quiz.spotify.fake import FakeSpotifyCatalog, SpotifyCatalog
from music_quiz.spotify.web_api import CatalogError, SpotifyWebCatalog

load_dotenv()

logger = logging.getLogger("music_quiz")

settings: Settings = load_settings(os.environ)

app = FastAPI(title="Spotify Music Quiz", version="0.1.0")
register_error_handlers(app)

# Explicit allowlist only. No wildcard origin, and only the methods and headers
# this API actually uses. Credentials stay enabled for the same-machine host
# session; a wildcard origin would be rejected by browsers anyway.
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    allow_credentials=True,
    max_age=600,
)

repository = SQLiteGameRepository(settings.database_path)
token_repo = TokenRepository(settings.database_path)
auth_service = (
    SpotifyAuthService(token_repo, settings.spotify_client_id)
    if settings.spotify_client_id
    else None
)
service = QuizService(FakeSpotifyCatalog(), repository)
oauth_states = OAuthStateStore(clock=settings.clock)

FAKE_PLAYLIST_ID = "fake-playlist"


def _spotify_token() -> SpotifyToken:
    """Return a usable Spotify token or fail with the standard error envelope."""
    if not auth_service:
        raise AppError(503, "spotify_not_configured", "Spotify is not configured on this server.")
    try:
        token = auth_service.get_default_token()
    except TokenRefreshError as exc:
        raise AppError(
            401,
            "spotify_reauthentication_required",
            "Your Spotify session expired. Sign in again.",
            cause=exc,
        ) from exc
    if token is None or token.is_expired():
        raise AppError(
            401,
            "spotify_not_authenticated",
            "Connect a Spotify account before starting playback.",
        )
    return token


def _access_token() -> str:
    return _spotify_token().access_token


def _has_spotify_session() -> bool:
    if not auth_service:
        return False
    try:
        token = auth_service.get_default_token()
    except TokenRefreshError:
        return False
    return token is not None and not token.is_expired()


def current_catalog() -> SpotifyCatalog:
    """Real Spotify when a session exists, the demo catalogue otherwise.

    Real URIs are required for audible playback; the fake catalogue keeps the
    game flow usable (and the tests offline) without an account.
    """
    if _has_spotify_session():
        return SpotifyWebCatalog(_access_token)
    return service.catalog


class ConfigInput(BaseModel):
    rounds: int = Field(10, ge=1, le=100)
    excerpt_seconds: int = Field(10, ge=1, le=60)
    mode: ExcerptMode = ExcerptMode.RANDOM
    participants: list[str] = Field(default_factory=lambda: ["Team A"], min_length=1, max_length=12)
    seed: int | None = None
    time_limit_seconds: int | None = Field(None, ge=1, le=7200)
    playlist_id: str = Field("fake-playlist", min_length=1, max_length=64)


class ScoreInput(BaseModel):
    participant_id: UUID
    points: int = Field(..., ge=-100, le=100)
    reason: str = Field("manual", min_length=1, max_length=64)
    event_id: UUID | None = None


def _not_found() -> AppError:
    return AppError(404, "game_not_found", "That game does not exist.")


def payload(game: Game, reveal: bool = False) -> dict[str, object]:
    current = game.current_round if game.status is not GameStatus.FINISHED else None
    result: dict[str, object] = {
        "id": str(game.id),
        "status": game.status,
        "round_number": current.number if current else len(game.queue),
        "rounds": len(game.queue),
        "excerpt_seconds": game.config.excerpt_seconds,
        "time_limit_seconds": game.config.time_limit_seconds,
        # Backend-authoritative clock. The frontend renders this value and never
        # decides on its own when a round has ended.
        "excerpt_remaining_ms": game.remaining_excerpt_ms(),
        "excerpt_deadline_ms": game.excerpt_deadline_ms,
        "participants": [
            {"id": str(p.id), "name": p.name, "score": p.score} for p in game.participants
        ],
        "score_events": [
            {
                "id": str(e.id),
                "participant_id": str(e.participant_id),
                "points": e.points,
                "reason": e.reason,
                "reversed": e.reversed,
            }
            for e in game.score_events
        ],
    }
    # Concealment invariant: answer fields are serialised only after reveal.
    if current and reveal and game.status is GameStatus.REVEALED:
        result["answer"] = {
            "title": current.track.title,
            "artists": list(current.track.artists),
            "album": current.track.album,
            "image_url": current.track.image_url,
        }
    if current and game.status in (GameStatus.PLAYING, GameStatus.PAUSED):
        # The track URI is required by the Web Playback SDK to actually play
        # audio. It is opaque to the player on screen and carries no title,
        # artist or album, so concealment is preserved.
        result["playback"] = {
            "uri": current.track.uri,
            "position_ms": current.excerpt_start_ms,
        }
    return result


def _load(game_id: UUID) -> Game:
    try:
        return service.get(game_id)
    except KeyError as exc:
        raise _not_found() from exc


@app.get("/api/v1/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "spotify_configured": bool(settings.spotify_client_id),
        "playback": "web-playback-sdk",
    }


@app.get("/api/v1/config")
def config_status() -> dict[str, object]:
    """Report configuration readiness without leaking any credential value."""
    return {
        "spotify_client_id_configured": bool(settings.spotify_client_id),
        "redirect_uri": settings.redirect_uri,
        "frontend_origin": settings.frontend_origin,
        "playback_implemented": True,
        "problems": list(settings.problems),
    }


@app.get("/api/v1/auth/status")
def auth_status() -> dict[str, bool]:
    if not auth_service:
        return {"authenticated": False, "configured": False}
    try:
        token = auth_service.get_default_token()
    except TokenRefreshError:
        # A refresh failure means the stored grant is no longer usable; report
        # it as signed out rather than failing the status probe.
        return {"authenticated": False, "configured": True}
    return {
        "authenticated": token is not None and not token.is_expired(),
        "configured": True,
    }


@app.get("/api/v1/auth/login")
def login() -> RedirectResponse:
    if not settings.spotify_client_id:
        raise AppError(503, "spotify_not_configured", "Spotify is not configured on this server.")
    auth_state = AuthState(secrets.token_urlsafe(32), secrets.token_urlsafe(64))
    oauth_states.put(auth_state)
    url = authorization_url(settings.spotify_client_id, settings.redirect_uri, auth_state)
    return RedirectResponse(url, status_code=307)


def _auth_redirect(params: str) -> RedirectResponse:
    return RedirectResponse(f"{settings.frontend_origin}/?{params}", status_code=303)


@app.get("/api/v1/auth/callback")
def callback(
    code: str | None = None, state: str | None = None, error: str | None = None
) -> RedirectResponse:
    """Spotify redirect target.

    The path here MUST match SPOTIFY_REDIRECT_URI and the URI registered in the
    Spotify dashboard, otherwise Spotify refuses the request before it arrives.

    This endpoint is reached by a top-level browser navigation, so it always
    answers with a redirect back into the app. Raising a JSON error here would
    dead-end the user on a raw error document.
    """
    auth_state = oauth_states.consume(state)
    if auth_state is None:
        # Covers unknown, replayed, expired and missing state alike; the client
        # is told nothing that would help distinguish them.
        logger.warning("oauth_callback_rejected reason=state_not_consumable")
        return _auth_redirect("auth_error=invalid_state")
    if error:
        return _auth_redirect("auth_error=denied")
    if not code:
        return _auth_redirect("auth_error=missing_code")
    if not auth_service:
        return _auth_redirect("auth_error=not_configured")

    try:
        auth_service.exchange_code(code, settings.redirect_uri, auth_state.verifier)
    except TokenRefreshError as exc:
        # The upstream message can embed the code or token payload, so it is
        # logged without the sensitive values and never returned to the browser.
        logger.warning("oauth_token_exchange_failed cause=%s", type(exc).__name__)
        return _auth_redirect("auth_error=exchange_failed")
    except Exception as exc:  # noqa: BLE001 - the browser must never see a 500 here
        logger.exception("oauth_callback_unexpected type=%s", type(exc).__name__)
        return _auth_redirect("auth_error=unexpected")
    return _auth_redirect("authenticated=1")


@app.get("/api/v1/auth/token")
def auth_token() -> dict[str, object]:
    """Hand the browser a short-lived access token for the Web Playback SDK.

    This is a single-user application bound to the loopback interface and a
    strict CORS allowlist; the SDK cannot run without the token in the page.
    """
    token = _spotify_token()
    return {
        "access_token": token.access_token,
        "expires_at": token.expires_at,
        "scope": token.scope,
    }


@app.post("/api/v1/auth/logout")
def logout() -> dict[str, bool]:
    oauth_states.clear()
    if auth_service:
        auth_service.revoke_token()
    return {"authenticated": False}


@app.get("/api/v1/playlists")
def playlists() -> list[dict[str, object]]:
    try:
        return current_catalog().playlists()
    except CatalogError as exc:
        raise AppError(
            502, "spotify_unavailable", "Could not read your Spotify playlists.", cause=exc
        ) from exc


@app.get("/api/v1/playlists/{playlist_id}/analysis")
def analysis(playlist_id: str) -> dict[str, int]:
    try:
        items = current_catalog().playlist_items(playlist_id)
    except CatalogError as exc:
        raise AppError(
            502, "spotify_unavailable", "Could not read that Spotify playlist.", cause=exc
        ) from exc
    eligible = len(
        {i.get("uri") for i in items if isinstance(i, dict) and isinstance(i.get("uri"), str)}
    )
    return {
        "total_items": len(items),
        "eligible_unique_tracks": eligible,
        "duplicates_removed": len(items) - eligible,
    }


@app.post("/api/v1/games")
def create_game(body: ConfigInput) -> dict[str, object]:
    catalog = current_catalog()
    playlist_id = body.playlist_id
    if isinstance(catalog, FakeSpotifyCatalog):
        playlist_id = FAKE_PLAYLIST_ID
    try:
        game = service.create(
            playlist_id,
            GameConfig(
                rounds=body.rounds,
                excerpt_seconds=body.excerpt_seconds,
                mode=body.mode,
                time_limit_seconds=body.time_limit_seconds,
            ),
            body.participants,
            body.seed,
            catalog=catalog,
        )
    except CatalogError as exc:
        raise AppError(
            502, "spotify_unavailable", "Could not read that Spotify playlist.", cause=exc
        ) from exc
    except DomainError as exc:
        raise AppError(400, "invalid_game_config", str(exc)) from exc
    return payload(game)


@app.get("/api/v1/games/{game_id}")
def get_game(game_id: UUID) -> dict[str, object]:
    game = _load(game_id)
    return payload(game, reveal=game.status is GameStatus.REVEALED)


def mutate(game_id: UUID, operation: str) -> dict[str, object]:
    game = _load(game_id)
    try:
        getattr(game, operation)()
    except DomainError as exc:
        raise AppError(409, "invalid_state_transition", str(exc)) from exc
    service.repository.save(game)
    return payload(game, reveal=game.status is GameStatus.REVEALED)


@app.post("/api/v1/games/{game_id}/round/start")
def start(game_id: UUID) -> dict[str, object]:
    return mutate(game_id, "start")


@app.post("/api/v1/games/{game_id}/round/pause")
def pause(game_id: UUID) -> dict[str, object]:
    return mutate(game_id, "pause")


@app.post("/api/v1/games/{game_id}/round/resume")
def resume(game_id: UUID) -> dict[str, object]:
    return mutate(game_id, "resume")


@app.post("/api/v1/games/{game_id}/round/reveal")
def reveal(game_id: UUID) -> dict[str, object]:
    return mutate(game_id, "reveal")


@app.post("/api/v1/games/{game_id}/round/next")
def next_round(game_id: UUID) -> dict[str, object]:
    return mutate(game_id, "next_round")


@app.post("/api/v1/games/{game_id}/scores")
def award_score(game_id: UUID, body: ScoreInput) -> dict[str, object]:
    game = _load(game_id)
    try:
        game.add_score(body.participant_id, body.points, body.reason, body.event_id)
    except DomainError as exc:
        raise AppError(409, "score_rejected", str(exc)) from exc
    service.repository.save(game)
    return payload(game, reveal=game.status is GameStatus.REVEALED)


@app.post("/api/v1/games/{game_id}/scores/{event_id}/reverse")
def reverse_score(game_id: UUID, event_id: UUID) -> dict[str, object]:
    game = _load(game_id)
    try:
        game.reverse_score(event_id)
    except DomainError as exc:
        raise AppError(409, "score_reversal_rejected", str(exc)) from exc
    service.repository.save(game)
    return payload(game, reveal=game.status is GameStatus.REVEALED)
