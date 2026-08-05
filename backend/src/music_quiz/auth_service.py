from __future__ import annotations

import time

import httpx

from music_quiz.persistence.tokens import SpotifyToken, TokenRepository


class TokenRefreshError(Exception):
    """Raised when token refresh fails."""

    pass


class SpotifyAuthService:
    """Service for managing Spotify OAuth tokens with auto-refresh."""

    def __init__(self, token_repo: TokenRepository, client_id: str) -> None:
        self.token_repo = token_repo
        self.client_id = client_id
        self._http_client = httpx.Client(timeout=10.0)

    def exchange_code(self, code: str, redirect_uri: str, verifier: str) -> SpotifyToken:
        """
        Exchange authorization code for access token.
        Returns SpotifyToken and saves it to repository.
        """
        response = self._http_client.post(
            "https://accounts.spotify.com/api/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": self.client_id,
                "code_verifier": verifier,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

        if response.status_code != 200:
            raise TokenRefreshError(
                f"Token exchange failed: {response.status_code} {response.text}"
            )

        data = response.json()
        token = SpotifyToken(
            user_id="default",  # Single-user app
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            token_type=data.get("token_type", "Bearer"),
            expires_at=int(time.time() + data["expires_in"]),
            scope=data.get("scope", ""),
        )

        self.token_repo.save(token)
        return token

    def refresh_token(self, token: SpotifyToken) -> SpotifyToken:
        """
        Refresh an expired token using refresh_token.
        Returns new SpotifyToken and saves it to repository.
        """
        response = self._http_client.post(
            "https://accounts.spotify.com/api/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": token.refresh_token,
                "client_id": self.client_id,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

        if response.status_code != 200:
            raise TokenRefreshError(f"Token refresh failed: {response.status_code} {response.text}")

        data = response.json()
        new_token = SpotifyToken(
            user_id=token.user_id,
            access_token=data["access_token"],
            refresh_token=data.get("refresh_token", token.refresh_token),
            token_type=data.get("token_type", "Bearer"),
            expires_at=int(time.time() + data["expires_in"]),
            scope=data.get("scope", token.scope),
        )

        self.token_repo.save(new_token)
        return new_token

    def get_valid_token(self, user_id: str = "default") -> SpotifyToken | None:
        """
        Get a valid access token, refreshing if necessary.
        Returns None if no token exists.
        Raises TokenRefreshError if refresh fails.
        """
        token = self.token_repo.get(user_id)
        if token is None:
            return None

        # Auto-refresh if expired (with 60s buffer)
        if token.is_expired(buffer_seconds=60):
            token = self.refresh_token(token)

        return token

    def get_default_token(self) -> SpotifyToken | None:
        """
        Get the most recently used token (for single-user apps).
        Auto-refreshes if expired.
        """
        token = self.token_repo.get_default()
        if token is None:
            return None

        if token.is_expired(buffer_seconds=60):
            token = self.refresh_token(token)

        return token

    def revoke_token(self, user_id: str = "default") -> None:
        """Delete stored token (logout)."""
        self.token_repo.delete(user_id)
