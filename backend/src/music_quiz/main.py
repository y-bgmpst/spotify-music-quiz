from __future__ import annotations

import logging
import os
import secrets
from uuid import UUID

from dotenv import load_dotenv
from fastapi import Cookie, FastAPI, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from music_quiz.auth import AuthState, authorization_url
from music_quiz.auth_service import SpotifyAuthService, TokenRefreshError
from music_quiz.config import Settings, load_settings
from music_quiz.domain.game import DomainError, ExcerptMode, Game, GameConfig, GameStatus
from music_quiz.errors import AppError, register_error_handlers
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
SESSION_COOKIE_NAME = "spotify_quiz_session"
SESSION_MAX_AGE = 30 * 24 * 60 * 60

FAKE_PLAYLIST_ID = "fake-playlist"


def _session_user(session_id: str | None) -> str | None:
    return token_repo.get_session_user(session_id)


def _spotify_token(session_id: str | None) -> SpotifyToken:
    if _session_user(session_id) is None:
        raise AppError(
            401,
            "spotify_not_authenticated",
            "Connect a Spotify account before starting playback.",
        )
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


def _access_token(session_id: str | None) -> str:
    return _spotify_token(session_id).access_token


def _has_spotify_session(session_id: str | None) -> bool:
    if _session_user(session_id) is None:
        return False
    if not auth_service:
        return False
    try:
        token = auth_service.get_default_token()
    except TokenRefreshError:
        return False
    return token is not None and not token.is_expired()


def current_catalog(session_id: str | None) -> SpotifyCatalog:
    if settings.fake_spotify:
        return service.catalog
    if _has_spotify_session(session_id):
        return SpotifyWebCatalog(lambda: _access_token(session_id))
    raise AppError(
        401,
        "spotify_not_authenticated",
        "Connect a Spotify account before reading Spotify data.",
    )


def _spotify_catalog_error(exc: CatalogError, message: str) -> AppError:
    status = exc.status_code if exc.status_code in {401, 403, 404, 429} else 502
    code = {
        401: "spotify_reauthentication_required",
        403: "spotify_forbidden",
        404: "spotify_not_found",
        429: "spotify_rate_limited",
    }.get(status, "spotify_unavailable")
    return AppError(status, code, message, cause=exc)


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
    if current and reveal and game.status is GameStatus.REVEALED:
        result["answer"] = {
            "title": current.track.title,
            "artists": list(current.track.artists),
            "album": current.track.album,
            "image_url": current.track.image_url,
        }
    if current and game.status in (GameStatus.PLAYING, GameStatus.PAUSED):
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


@app.get("/")
def root() -> RedirectResponse:
    """Send direct browser visits to the bundled frontend."""
    return RedirectResponse("/frontend/", status_code=307)


@app.get("/api/v1/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "spotify_configured": bool(settings.spotify_client_id),
        "playback": "web-playback-sdk",
    }


@app.get("/api/v1/config")
def config_status() -> dict[str, object]:
    return {
        "spotify_client_id_configured": bool(settings.spotify_client_id),
        "redirect_uri": settings.redirect_uri,
        "frontend_origin": settings.frontend_origin,
        "playback_implemented": True,
        "problems": list(settings.problems),
    }


@app.get("/api/v1/auth/status")
def auth_status(spotify_quiz_session: str | None = Cookie(default=None)) -> dict[str, bool]:
    if not auth_service:
        return {"authenticated": False, "configured": False}
    if _session_user(spotify_quiz_session) is None:
        return {"authenticated": False, "configured": True}
    try:
        token = auth_service.get_default_token()
    except TokenRefreshError:
        return {"authenticated": False, "configured": True}
    return {
        "authenticated": token is not None and not token.is_expired(),
        "configured": True,
    }


@app.get("/api/v1/auth/login")
def login(spotify_quiz_session: str | None = Cookie(default=None)) -> RedirectResponse:
    if not settings.spotify_client_id:
        raise AppError(503, "spotify_not_configured", "Spotify is not configured on this server.")
    session_id = spotify_quiz_session
    new_session = False
    if _session_user(session_id) is None:
        session_id = token_repo.create_session(max_age=SESSION_MAX_AGE)
        new_session = True
    assert session_id is not None
    auth_state = AuthState(secrets.token_urlsafe(32), secrets.token_urlsafe(64))
    token_repo.save_oauth_state(auth_state.state, auth_state.verifier, session_id)
    url = authorization_url(settings.spotify_client_id, settings.redirect_uri, auth_state)
    redirect = RedirectResponse(url, status_code=307)
    if new_session:
        redirect.set_cookie(
            SESSION_COOKIE_NAME,
            session_id,
            max_age=SESSION_MAX_AGE,
            httponly=True,
            samesite="lax",
            secure=settings.session_cookie_secure,
            path="/",
        )
    return redirect


def _auth_redirect(params: str) -> RedirectResponse:
    return RedirectResponse(f"{settings.frontend_origin}/?{params}", status_code=303)


@app.get("/api/v1/auth/callback")
def callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    spotify_quiz_session: str | None = Cookie(default=None),
) -> RedirectResponse:
    verifier = token_repo.consume_oauth_state(state, spotify_quiz_session)
    if verifier is None:
        logger.warning("oauth_callback_rejected reason=state_not_consumable")
        return _auth_redirect("auth_error=invalid_state")
    if error:
        return _auth_redirect("auth_error=denied")
    if not code:
        return _auth_redirect("auth_error=missing_code")
    if not auth_service:
        return _auth_redirect("auth_error=not_configured")

    try:
        auth_service.exchange_code(code, settings.redirect_uri, verifier)
    except TokenRefreshError as exc:
        logger.warning(
            "oauth_token_exchange_failed cause=%s reason=%s",
            type(exc).__name__,
            exc.reason,
        )
        return _auth_redirect("auth_error=exchange_failed")
    except Exception as exc:  # noqa: BLE001
        logger.exception("oauth_callback_unexpected type=%s", type(exc).__name__)
        return _auth_redirect("auth_error=unexpected")
    if spotify_quiz_session is None:
        return _auth_redirect("auth_error=invalid_state")
    new_session = token_repo.rotate_session(spotify_quiz_session, max_age=SESSION_MAX_AGE)
    redirect = _auth_redirect("auth_callback=success")
    redirect.set_cookie(
        SESSION_COOKIE_NAME,
        new_session,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=settings.session_cookie_secure,
        path="/",
    )
    return redirect


@app.get("/api/v1/auth/token")
def auth_token(spotify_quiz_session: str | None = Cookie(default=None)) -> dict[str, object]:
    token = _spotify_token(spotify_quiz_session)
    return {
        "access_token": token.access_token,
        "expires_at": token.expires_at,
        "scope": token.scope,
    }


@app.post("/api/v1/auth/logout")
def logout(
    response: Response, spotify_quiz_session: str | None = Cookie(default=None)
) -> dict[str, bool]:
    token_repo.clear_oauth_states(spotify_quiz_session)
    token_repo.delete_session(spotify_quiz_session)
    if auth_service:
        auth_service.revoke_token()
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return {"authenticated": False}


@app.get("/api/v1/playlists")
def playlists(spotify_quiz_session: str | None = Cookie(default=None)) -> list[dict[str, object]]:
    try:
        return current_catalog(spotify_quiz_session).playlists()
    except CatalogError as exc:
        raise _spotify_catalog_error(exc, "Could not read your Spotify playlists.") from exc


@app.get("/api/v1/playlists/{playlist_id}/analysis")
def analysis(
    playlist_id: str,
    excerpt_seconds: int = Query(10, ge=1, le=60),
    mode: ExcerptMode = ExcerptMode.INTRO,
    spotify_quiz_session: str | None = Cookie(default=None),
) -> dict[str, int]:
    try:
        return current_catalog(spotify_quiz_session).playlist_analysis(
            playlist_id, excerpt_seconds, mode.value
        )
    except CatalogError as exc:
        raise _spotify_catalog_error(exc, "Could not read that Spotify playlist.") from exc


@app.post("/api/v1/games")
def create_game(
    body: ConfigInput, spotify_quiz_session: str | None = Cookie(default=None)
) -> dict[str, object]:
    catalog = current_catalog(spotify_quiz_session)
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
        raise _spotify_catalog_error(exc, "Could not read that Spotify playlist.") from exc
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
