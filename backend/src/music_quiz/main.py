from __future__ import annotations

import os
import secrets
from uuid import UUID

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from music_quiz.auth import AuthState, authorization_url
from music_quiz.auth_service import SpotifyAuthService, TokenRefreshError
from music_quiz.domain.game import DomainError, ExcerptMode, GameConfig, GameStatus
from music_quiz.persistence.sqlite import SQLiteGameRepository
from music_quiz.persistence.tokens import TokenRepository
from music_quiz.services import QuizService
from music_quiz.spotify.fake import FakeSpotifyCatalog

# Load .env file
load_dotenv()

app = FastAPI(title="Spotify Music Quiz", version="0.1.0")
frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://127.0.0.1:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin, "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# Initialize persistence
db_path = os.getenv("DATABASE_PATH", ".data/quiz.db")
repository = SQLiteGameRepository(db_path)
token_repo = TokenRepository(db_path)
client_id = os.getenv("SPOTIFY_CLIENT_ID", "")
auth_service = SpotifyAuthService(token_repo, client_id) if client_id else None
service = QuizService(FakeSpotifyCatalog(), repository)
SESSION_COOKIE = "spotify_quiz_session"
SESSION_MAX_AGE = 30 * 24 * 60 * 60


class ConfigInput(BaseModel):
    rounds: int = Field(10, ge=1)
    excerpt_seconds: int = Field(10, ge=1)
    mode: ExcerptMode = ExcerptMode.RANDOM
    participants: list[str] = Field(default_factory=lambda: ["Team A"])
    seed: int | None = None
    time_limit_seconds: int | None = Field(None, ge=1)  # 300 (5min) or 600 (10min)


def payload(game: object, reveal: bool = False) -> dict[str, object]:
    from music_quiz.domain.game import Game

    assert isinstance(game, Game)
    current = game.current_round if game.status is not GameStatus.FINISHED else None
    result: dict[str, object] = {
        "id": str(game.id),
        "status": game.status,
        "round_number": current.number if current else len(game.queue),
        "rounds": len(game.queue),
        "excerpt_seconds": game.config.excerpt_seconds,
        "time_limit_seconds": game.config.time_limit_seconds,
        "participants": [
            {"id": str(p.id), "name": p.name, "score": p.score} for p in game.participants
        ],
    }
    if current and reveal:
        result["answer"] = {
            "title": current.track.title,
            "artists": list(current.track.artists),
            "album": current.track.album,
            "image_url": current.track.image_url,
        }
    if current and game.status in (GameStatus.PLAYING, GameStatus.PAUSED):
        result["playback"] = {"position_ms": current.excerpt_start_ms}
    return result


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/auth/status")
def auth_status(request: Request) -> dict[str, bool]:
    if not auth_service:
        return {"authenticated": False}
    user_id = token_repo.get_session_user(request.cookies.get(SESSION_COOKIE))
    if user_id is None:
        return {"authenticated": False}
    try:
        token = auth_service.get_valid_token(user_id)
    except TokenRefreshError:
        return {"authenticated": False}
    return {"authenticated": token is not None and not token.is_expired()}


@app.get("/api/v1/auth/login")
def login() -> RedirectResponse:
    client_id = os.getenv("SPOTIFY_CLIENT_ID")
    if not client_id:
        raise HTTPException(503, "Spotify Client ID is not configured")
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    token_repo.save_oauth_state(state, verifier)
    return RedirectResponse(
        authorization_url(
            client_id,
            os.getenv("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:8000/api/v1/auth/callback"),
            AuthState(state, verifier),
        )
    )


@app.get("/api/v1/auth/callback")
def callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    verifier = token_repo.consume_oauth_state(state) if state else None
    if not verifier:
        raise HTTPException(400, "invalid OAuth state")
    if error or not code:
        raise HTTPException(400, "Spotify authorization was denied")

    if not auth_service:
        raise HTTPException(503, "Auth service not configured")

    try:
        redirect_uri = os.getenv(
            "SPOTIFY_REDIRECT_URI", "http://127.0.0.1:8000/api/v1/auth/callback"
        )
        auth_service.exchange_code(code, redirect_uri, verifier)
        session_id = token_repo.create_session(max_age=SESSION_MAX_AGE)
        response = RedirectResponse(frontend_origin + "/")
        response.set_cookie(
            SESSION_COOKIE,
            session_id,
            max_age=SESSION_MAX_AGE,
            httponly=True,
            samesite="lax",
            secure=os.getenv("SESSION_COOKIE_SECURE", "0") == "1",
            path="/",
        )
        return response
    except TokenRefreshError as exc:
        raise HTTPException(500, "Token exchange failed") from exc


@app.get("/api/v1/playlists")
def playlists() -> list[dict[str, object]]:
    return service.catalog.playlists()


@app.get("/api/v1/playlists/{playlist_id}/analysis")
def analysis(playlist_id: str) -> dict[str, int]:
    items = service.catalog.playlist_items(playlist_id)
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
    try:
        game = service.create(
            "fake-playlist",
            GameConfig(
                rounds=body.rounds,
                excerpt_seconds=body.excerpt_seconds,
                mode=body.mode,
                time_limit_seconds=body.time_limit_seconds,
            ),
            body.participants,
            body.seed,
        )
    except DomainError as exc:
        raise HTTPException(400, str(exc)) from exc
    return payload(game)


@app.get("/api/v1/games/{game_id}")
def get_game(game_id: UUID) -> dict[str, object]:
    try:
        return payload(
            service.get(game_id), reveal=service.get(game_id).status is GameStatus.REVEALED
        )
    except KeyError as exc:
        raise HTTPException(404, "game not found") from exc


def mutate(game_id: UUID, operation: str) -> dict[str, object]:
    try:
        game = service.get(game_id)
        getattr(game, operation)()
        service.repository.save(game)
        return payload(game, reveal=game.status is GameStatus.REVEALED)
    except KeyError as exc:
        raise HTTPException(404, "game not found") from exc
    except DomainError as exc:
        raise HTTPException(409, str(exc)) from exc


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
