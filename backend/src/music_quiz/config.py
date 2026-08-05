"""Configuration loading and validation.

Values come from the environment (optionally via ``.env``). Nothing here reads
or logs a secret value; only whether a value is present is ever reported.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Callable, Mapping
from urllib.parse import urlparse

DEFAULT_FRONTEND_ORIGIN = "http://127.0.0.1:5173"
DEFAULT_REDIRECT_URI = "http://127.0.0.1:8000/api/v1/auth/callback"
DEFAULT_DATABASE_PATH = ".data/quiz.db"

# A Spotify client ID is a 32 character lowercase hex string. Anything else is
# rejected locally so the user sees a precise message instead of Spotify's
# opaque "INVALID_CLIENT: Invalid client id" page.
CLIENT_ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")


def _unquote(value: str) -> str:
    """Strip surrounding quotes and whitespace left over from .env editing."""
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        value = value[1:-1].strip()
    return value


@dataclass(frozen=True)
class Settings:
    spotify_client_id: str
    redirect_uri: str
    frontend_origin: str
    database_path: str
    allowed_origins: tuple[str, ...]
    problems: tuple[str, ...] = ()
    clock: Callable[[], float] = field(default=time.monotonic, repr=False, compare=False)


def _origin_of(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return url.rstrip("/")
    return f"{parsed.scheme}://{parsed.netloc}"


def load_settings(env: Mapping[str, str]) -> Settings:
    frontend_origin = _origin_of(env.get("FRONTEND_ORIGIN", DEFAULT_FRONTEND_ORIGIN))
    redirect_uri = _unquote(env.get("SPOTIFY_REDIRECT_URI", "")) or DEFAULT_REDIRECT_URI
    raw_client_id = env.get("SPOTIFY_CLIENT_ID", "")
    client_id = _unquote(raw_client_id)

    problems: list[str] = []
    if not client_id:
        problems.append(
            "SPOTIFY_CLIENT_ID is not set; Spotify sign-in is disabled until it is configured."
        )
    elif client_id in {"your-client-id-here", "abc123your-client-id-here"}:
        problems.append(
            "SPOTIFY_CLIENT_ID still holds the placeholder from .env.example; "
            "replace it with the Client ID from your Spotify app dashboard."
        )
        client_id = ""
    elif not CLIENT_ID_PATTERN.match(client_id):
        problems.append(
            "SPOTIFY_CLIENT_ID is not a valid Spotify Client ID "
            "(expected 32 lowercase hexadecimal characters, got "
            f"{len(client_id)} characters). Copy the Client ID - not the Client Secret "
            "and not the app URL - from https://developer.spotify.com/dashboard."
        )
        client_id = ""
    if env.get("SPOTIFY_CLIENT_SECRET"):
        problems.append(
            "SPOTIFY_CLIENT_SECRET is set but never used; PKCE requires no client secret."
        )
    if urlparse(redirect_uri).hostname == "localhost":
        problems.append(
            "SPOTIFY_REDIRECT_URI uses 'localhost'; Spotify requires the loopback IP 127.0.0.1."
        )

    # CORS allowlist: the configured frontend origin plus any explicit extras.
    extra = env.get("ADDITIONAL_ALLOWED_ORIGINS", "")
    origins = [frontend_origin]
    origins += [_origin_of(o) for o in extra.split(",") if o.strip()]
    if env.get("ALLOW_LOCALHOST_ORIGIN", "1") == "1":
        origins.append("http://localhost:5173")
    deduped = tuple(dict.fromkeys(o for o in origins if o))

    return Settings(
        spotify_client_id=client_id,
        redirect_uri=redirect_uri,
        frontend_origin=frontend_origin,
        database_path=env.get("DATABASE_PATH", DEFAULT_DATABASE_PATH),
        allowed_origins=deduped,
        problems=tuple(problems),
    )
