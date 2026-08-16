from __future__ import annotations

import base64
import hashlib
import secrets
from dataclasses import dataclass
from urllib.parse import urlencode


def pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


@dataclass
class AuthState:
    state: str
    verifier: str


def authorization_url(client_id: str, redirect_uri: str, auth: AuthState) -> str:
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": auth.state,
        "code_challenge_method": "S256",
        "code_challenge": pkce_challenge(auth.verifier),
        "scope": "streaming user-read-email user-read-private user-read-playback-state "
        "user-modify-playback-state playlist-read-private playlist-read-collaborative",
    }
    return "https://accounts.spotify.com/authorize?" + urlencode(params)


def pkce_challenge(verifier: str) -> str:
    return (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    )
