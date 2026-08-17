from __future__ import annotations

import httpx
import pytest

from music_quiz.auth_service import SpotifyAuthService, TokenRefreshError
from music_quiz.persistence.tokens import TokenRepository


def test_token_exchange_classifies_spotify_rejection_without_upstream_secrets(tmp_path) -> None:
    service = SpotifyAuthService(TokenRepository(str(tmp_path / "tokens.db")), "a" * 32)
    service._http_client = httpx.Client(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                400,
                json={
                    "error": "invalid_grant",
                    "error_description": "authorization code SECRET-CODE-VALUE is invalid",
                },
            )
        )
    )

    with pytest.raises(TokenRefreshError) as failure:
        service.exchange_code("SECRET-CODE-VALUE", "http://127.0.0.1:8000/callback", "verifier")

    assert failure.value.reason == "spotify_http_400_invalid_grant"
    assert "SECRET-CODE-VALUE" not in str(failure.value)
