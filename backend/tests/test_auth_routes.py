"""OAuth route behaviour: the callback exists, validates state, and is safe."""

from __future__ import annotations

import time

import pytest

from music_quiz.auth import AuthState
from music_quiz.auth_service import TokenRefreshError


def test_callback_route_is_registered() -> None:
    """Regression: the handler previously existed with no route decorator."""
    from music_quiz.main import app

    paths = {getattr(route, "path", None) for route in app.routes}
    assert "/api/v1/auth/callback" in paths


def test_login_redirects_to_spotify_and_records_state(api) -> None:
    client, main = api

    response = client.get("/api/v1/auth/login", follow_redirects=False)

    assert response.status_code == 307
    location = response.headers["location"]
    assert location.startswith("https://accounts.spotify.com/authorize")
    assert "code_challenge_method=S256" in location
    assert len(main.oauth_states) == 1


def test_callback_with_valid_state_exchanges_code_and_redirects(api, monkeypatch) -> None:
    client, main = api
    main.oauth_states.clear()
    main.oauth_states.put(AuthState("good-state", "the-verifier"))

    seen: dict[str, str] = {}

    def fake_exchange(code: str, redirect_uri: str, verifier: str) -> None:
        seen.update(code=code, redirect_uri=redirect_uri, verifier=verifier)

    monkeypatch.setattr(main.auth_service, "exchange_code", fake_exchange)

    response = client.get(
        "/api/v1/auth/callback",
        params={"code": "the-code", "state": "good-state"},
        follow_redirects=False,
    )

    assert response.status_code == 303
    assert response.headers["location"] == "http://127.0.0.1:5173/?authenticated=1"
    assert seen == {
        "code": "the-code",
        "redirect_uri": "http://127.0.0.1:8000/api/v1/auth/callback",
        "verifier": "the-verifier",
    }


def test_callback_rejects_mismatched_state(api) -> None:
    client, main = api
    main.oauth_states.clear()
    main.oauth_states.put(AuthState("good-state", "verifier"))

    response = client.get(
        "/api/v1/auth/callback",
        params={"code": "the-code", "state": "attacker-state"},
        follow_redirects=False,
    )

    assert response.status_code == 303
    assert response.headers["location"].endswith("/?auth_error=invalid_state")


def test_callback_rejects_a_replayed_state(api, monkeypatch) -> None:
    client, main = api
    main.oauth_states.clear()
    main.oauth_states.put(AuthState("once", "verifier"))
    monkeypatch.setattr(main.auth_service, "exchange_code", lambda *_: None)

    first = client.get(
        "/api/v1/auth/callback",
        params={"code": "c", "state": "once"},
        follow_redirects=False,
    )
    second = client.get(
        "/api/v1/auth/callback",
        params={"code": "c", "state": "once"},
        follow_redirects=False,
    )

    assert first.status_code == 303
    assert second.status_code == 303
    assert second.headers["location"].endswith("/?auth_error=invalid_state")


def test_callback_handles_user_denial_without_exchanging(api, monkeypatch) -> None:
    client, main = api
    main.oauth_states.clear()
    main.oauth_states.put(AuthState("denied-state", "verifier"))

    def explode(*_args: object) -> None:  # pragma: no cover - must not run
        raise AssertionError("exchange must not be attempted after a denial")

    monkeypatch.setattr(main.auth_service, "exchange_code", explode)

    response = client.get(
        "/api/v1/auth/callback",
        params={"error": "access_denied", "state": "denied-state"},
        follow_redirects=False,
    )

    assert response.status_code == 303
    assert response.headers["location"].endswith("/?auth_error=denied")


def test_failed_token_exchange_does_not_leak_upstream_detail(api, monkeypatch) -> None:
    client, main = api
    main.oauth_states.clear()
    main.oauth_states.put(AuthState("state-x", "verifier"))

    def failing_exchange(*_args: object) -> None:
        raise TokenRefreshError("invalid_grant for code SECRET-CODE-VALUE")

    monkeypatch.setattr(main.auth_service, "exchange_code", failing_exchange)

    response = client.get(
        "/api/v1/auth/callback",
        params={"code": "SECRET-CODE-VALUE", "state": "state-x"},
        follow_redirects=False,
    )

    assert response.status_code == 303
    location = response.headers["location"]
    assert location.endswith("/?auth_error=exchange_failed")
    assert "SECRET-CODE-VALUE" not in response.text + location
    assert "invalid_grant" not in response.text + location


def test_state_is_consumed_even_when_exchange_fails(api, monkeypatch) -> None:
    client, main = api
    main.oauth_states.clear()
    main.oauth_states.put(AuthState("state-y", "verifier"))
    monkeypatch.setattr(
        main.auth_service,
        "exchange_code",
        lambda *_: (_ for _ in ()).throw(TokenRefreshError("nope")),
    )

    client.get(
        "/api/v1/auth/callback",
        params={"code": "c", "state": "state-y"},
        follow_redirects=False,
    )

    assert len(main.oauth_states) == 0


def test_pending_state_store_stays_bounded_across_many_logins(api) -> None:
    client, main = api
    main.oauth_states.clear()

    for _ in range(main.oauth_states.max_pending + 20):
        client.get("/api/v1/auth/login", follow_redirects=False)

    assert len(main.oauth_states) <= main.oauth_states.max_pending


@pytest.mark.parametrize("path", ["/api/v1/auth/status", "/api/v1/config"])
def test_status_endpoints_never_expose_the_client_id(api, path: str) -> None:
    client, _ = api

    response = client.get(path)

    assert response.status_code == 200
    assert "0123456789abcdef0123456789abcdef" not in response.text


def test_callback_never_returns_a_raw_error_document(api, monkeypatch) -> None:
    """A browser navigation must always land back in the app, never on JSON."""
    client, main = api
    main.oauth_states.clear()
    main.oauth_states.put(AuthState("boom-state", "verifier"))

    def explode(*_args: object) -> None:
        raise RuntimeError("unexpected upstream failure")

    monkeypatch.setattr(main.auth_service, "exchange_code", explode)

    response = client.get(
        "/api/v1/auth/callback",
        params={"code": "c", "state": "boom-state"},
        follow_redirects=False,
    )

    assert response.status_code == 303
    assert response.headers["location"].endswith("/?auth_error=unexpected")
    assert "internal_error" not in response.text


def test_token_endpoint_requires_an_authenticated_session(api) -> None:
    client, main = api
    main.auth_service.revoke_token()

    response = client.get("/api/v1/auth/token")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "spotify_not_authenticated"


def test_token_endpoint_returns_the_stored_access_token(api, monkeypatch) -> None:
    client, main = api
    from music_quiz.persistence.tokens import SpotifyToken

    token = SpotifyToken(
        user_id="default",
        access_token="access-abc",
        refresh_token="refresh-abc",
        token_type="Bearer",
        expires_at=int(time.time()) + 3600,
        scope="streaming",
    )
    monkeypatch.setattr(main.auth_service, "get_default_token", lambda: token)

    response = client.get("/api/v1/auth/token")

    assert response.status_code == 200
    assert response.json()["access_token"] == "access-abc"
