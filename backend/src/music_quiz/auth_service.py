from __future__ import annotations

import time
from typing import Any

import httpx

from music_quiz.persistence.tokens import SpotifyToken, TokenRepository

TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token"


class TokenRefreshError(Exception):
    """Raised when a token exchange or refresh fails."""

    def __init__(self, message: str, *, reason: str = "unknown") -> None:
        super().__init__(message)
        self.reason = reason


class SpotifyAuthService:
    """Service for managing Spotify OAuth tokens with auto-refresh."""

    def __init__(self, token_repo: TokenRepository, client_id: str) -> None:
        self.token_repo = token_repo
        self.client_id = client_id
        self._http_client = httpx.Client(timeout=10.0)

    def _post_token(self, data: dict[str, str]) -> dict[str, Any]:
        """POST to Spotify's token endpoint.

        Transport, status and payload failures are all normalised into
        ``TokenRefreshError``. Without this, an ``httpx`` timeout or a missing
        JSON key escaped as an unhandled exception and the browser landed on an
        opaque ``internal_error`` page instead of the app.
        """
        try:
            response = self._http_client.post(
                TOKEN_ENDPOINT,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        except httpx.HTTPError as exc:
            raise TokenRefreshError("Could not reach Spotify.", reason="spotify_network") from exc

        if response.status_code != 200:
            reason = f"spotify_http_{response.status_code}"
            try:
                payload = response.json()
            except ValueError:
                payload = None
            if isinstance(payload, dict):
                error = payload.get("error")
                if (
                    isinstance(error, str)
                    and 1 <= len(error) <= 64
                    and all(character.isalnum() or character in {"_", "-"} for character in error)
                ):
                    reason += f"_{error}"
            raise TokenRefreshError(
                f"Spotify token request failed ({response.status_code}).", reason=reason
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise TokenRefreshError(
                "Spotify returned a non-JSON token response.", reason="spotify_invalid_response"
            ) from exc
        if not isinstance(payload, dict):
            raise TokenRefreshError(
                "Spotify returned an unexpected token response.",
                reason="spotify_invalid_response",
            )
        return payload

    @staticmethod
    def _require(payload: dict[str, Any], key: str) -> Any:
        value = payload.get(key)
        if value is None:
            raise TokenRefreshError(
                f"Spotify token response is missing '{key}'.", reason=f"spotify_missing_{key}"
            )
        return value

    def exchange_code(self, code: str, redirect_uri: str, verifier: str) -> SpotifyToken:
        """Exchange an authorization code for an access token and store it."""
        data = self._post_token(
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": self.client_id,
                "code_verifier": verifier,
            }
        )
        try:
            expires_in = int(self._require(data, "expires_in"))
        except (TypeError, ValueError) as exc:
            raise TokenRefreshError(
                "Spotify sent an unreadable token lifetime.", reason="spotify_invalid_expires_in"
            ) from exc

        token = SpotifyToken(
            user_id="default",  # Single-user app
            access_token=str(self._require(data, "access_token")),
            # PKCE normally returns a refresh token; treat an absent one as a
            # short-lived grant rather than crashing the callback.
            refresh_token=str(data.get("refresh_token") or ""),
            token_type=str(data.get("token_type", "Bearer")),
            expires_at=int(time.time() + expires_in),
            scope=str(data.get("scope", "")),
        )
        self.token_repo.save(token)
        return token

    def refresh_token(self, token: SpotifyToken) -> SpotifyToken:
        """Refresh an expired token and store the result."""
        if not token.refresh_token:
            raise TokenRefreshError("No refresh token stored; sign in again.")
        data = self._post_token(
            {
                "grant_type": "refresh_token",
                "refresh_token": token.refresh_token,
                "client_id": self.client_id,
            }
        )
        try:
            expires_in = int(self._require(data, "expires_in"))
        except (TypeError, ValueError) as exc:
            raise TokenRefreshError(
                "Spotify sent an unreadable token lifetime.", reason="spotify_invalid_expires_in"
            ) from exc

        new_token = SpotifyToken(
            user_id=token.user_id,
            access_token=str(self._require(data, "access_token")),
            refresh_token=str(data.get("refresh_token") or token.refresh_token),
            token_type=str(data.get("token_type", "Bearer")),
            expires_at=int(time.time() + expires_in),
            scope=str(data.get("scope", token.scope)),
        )
        self.token_repo.save(new_token)
        return new_token

    def get_valid_token(self, user_id: str = "default") -> SpotifyToken | None:
        """Return a usable token, refreshing it when it is close to expiry."""
        token = self.token_repo.get(user_id)
        if token is None:
            return None
        if token.is_expired(buffer_seconds=60):
            token = self.refresh_token(token)
        return token

    def get_default_token(self) -> SpotifyToken | None:
        """Return the stored single-user token, refreshing when needed."""
        token = self.token_repo.get_default()
        if token is None:
            return None
        if token.is_expired(buffer_seconds=60):
            token = self.refresh_token(token)
        return token

    def revoke_token(self, user_id: str = "default") -> None:
        """Delete stored token (logout)."""
        self.token_repo.delete(user_id)
