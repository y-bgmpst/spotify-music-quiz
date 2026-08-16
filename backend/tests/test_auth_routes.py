"""OAuth route behaviour: the callback exists, validates state, and is safe."""

from __future__ import annotations

import time
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from music_quiz.auth_service import TokenRefreshError


def start_login(client) -> tuple[str, str]:
    response = client.get("/api/v1/auth/login", follow_redirects=False)
    query = parse_qs(urlparse(response.headers["location"]).query)
    session = response.cookies.get("spotify_quiz_session") or client.cookies.get(
        "spotify_quiz_session"
    )
    assert session
    return query["state"][0], session


def test_callback_route_is_registered() -> None:
    """Regression: the handler previously existed with no route decorator."""
    from music_quiz.main import app

    paths = {getattr(route, "path", None) for route in app.routes}
    assert "/api/v1/auth/callback" in paths


def test_login_redirects_to_spotify_and_records_state(api) -> None:
    client, _ = api

    response = client.get("/api/v1/auth/login", follow_redirects=False)

    assert response.status_code == 307
    location = response.headers["location"]
    assert location.startswith("https://accounts.spotify.com/authorize")
    assert "code_challenge_method=S256" in location
    assert response.cookies["spotify_quiz_session"]
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]
    assert "Path=/" in response.headers["set-cookie"]
    assert set(parse_qs(urlparse(location).query)["scope"][0].split()) >= {
        "streaming",
        "user-read-email",
        "user-read-private",
    }


def test_callback_with_valid_state_exchanges_code_and_redirects(api, monkeypatch) -> None:
    client, main = api
    state, old_session = start_login(client)

    seen: dict[str, str] = {}

    def fake_exchange(code: str, redirect_uri: str, verifier: str) -> None:
        seen.update(code=code, redirect_uri=redirect_uri, verifier=verifier)

    monkeypatch.setattr(main.auth_service, "exchange_code", fake_exchange)

    response = client.get(
        "/api/v1/auth/callback",
        params={"code": "the-code", "state": state},
        follow_redirects=False,
    )

    assert response.status_code == 303
    assert response.headers["location"] == "http://127.0.0.1:5173/?auth_callback=success"
    assert response.cookies["spotify_quiz_session"] != old_session
    assert seen["code"] == "the-code"
    assert seen["redirect_uri"] == "http://127.0.0.1:8000/api/v1/auth/callback"
    assert seen["verifier"]


def test_successful_callback_authenticates_rotated_session(api, monkeypatch) -> None:
    client, main = api
    state, old_session = start_login(client)

    def fake_exchange(*_args: str) -> None:
        from music_quiz.persistence.tokens import SpotifyToken

        main.token_repo.save(
            SpotifyToken(
                user_id="default",
                access_token="access-token",
                refresh_token="refresh-token",
                token_type="Bearer",
                expires_at=int(time.time()) + 3600,
                scope="streaming",
            )
        )

    monkeypatch.setattr(main.auth_service, "exchange_code", fake_exchange)
    response = client.get(
        "/api/v1/auth/callback", params={"code": "c", "state": state}, follow_redirects=False
    )

    assert response.headers["location"].endswith("/?auth_callback=success")
    assert client.get("/api/v1/auth/status").json()["authenticated"] is True
    client.cookies.set("spotify_quiz_session", old_session)
    assert client.get("/api/v1/auth/status").json()["authenticated"] is False


def test_callback_rejects_mismatched_state(api, caplog) -> None:
    client, _ = api
    state, _ = start_login(client)

    response = client.get(
        "/api/v1/auth/callback",
        params={"code": "the-code", "state": "attacker-state"},
        follow_redirects=False,
    )

    assert response.status_code == 303
    assert response.headers["location"].endswith("/?auth_error=invalid_state")
    assert "SENSITIVE_CODE" not in caplog.text
    assert "attacker-state" not in caplog.text
    valid = client.get(
        "/api/v1/auth/callback", params={"code": "the-code", "state": state}, follow_redirects=False
    )
    assert valid.headers["location"].endswith("/?auth_error=exchange_failed") or valid.headers[
        "location"
    ].endswith("/?auth_callback=success")


def test_callback_rejects_a_replayed_state(api, monkeypatch) -> None:
    client, main = api
    state, _ = start_login(client)
    monkeypatch.setattr(main.auth_service, "exchange_code", lambda *_: None)

    first = client.get(
        "/api/v1/auth/callback",
        params={"code": "c", "state": state},
        follow_redirects=False,
    )
    second = client.get(
        "/api/v1/auth/callback",
        params={"code": "c", "state": state},
        follow_redirects=False,
    )

    assert first.status_code == 303
    assert second.status_code == 303
    assert second.headers["location"].endswith("/?auth_error=invalid_state")


@pytest.mark.parametrize("order", [(0, 1), (1, 0)])
def test_parallel_logins_in_one_session_are_independent(api, monkeypatch, order) -> None:
    client, main = api
    first, _ = start_login(client)
    second, _ = start_login(client)
    exchanged: list[str] = []
    monkeypatch.setattr(
        main.auth_service,
        "exchange_code",
        lambda code, _redirect, _verifier: exchanged.append(code),
    )
    states = [first, second]
    for index in order:
        response = client.get(
            "/api/v1/auth/callback",
            params={"code": f"code-{index}", "state": states[index]},
            follow_redirects=False,
        )
        assert response.headers["location"].endswith("/?auth_callback=success")
    assert exchanged == [f"code-{index}" for index in order]


def test_callback_without_cookie_fails_closed_without_consuming_or_exchanging(
    api, monkeypatch
) -> None:
    client, main = api
    state, _ = start_login(client)
    client.cookies.clear()
    monkeypatch.setattr(
        main.auth_service,
        "exchange_code",
        lambda *_: pytest.fail("token exchange must not run without the session cookie"),
    )

    response = client.get(
        "/api/v1/auth/callback", params={"code": "c", "state": state}, follow_redirects=False
    )
    assert response.headers["location"].endswith("/?auth_error=invalid_state")


def test_callback_from_another_session_fails_without_invalidating_owner(api, monkeypatch) -> None:
    client, main = api
    state, _ = start_login(client)
    with TestClient(main.app) as other:
        other_state, _ = start_login(other)
        monkeypatch.setattr(main.auth_service, "exchange_code", lambda *_: None)
        rejected = other.get(
            "/api/v1/auth/callback", params={"code": "c", "state": state}, follow_redirects=False
        )
        assert rejected.headers["location"].endswith("/?auth_error=invalid_state")
        # The foreign callback must not consume the other tab's own state.
        own = other.get(
            "/api/v1/auth/callback",
            params={"code": "c", "state": other_state},
            follow_redirects=False,
        )
        assert own.headers["location"].endswith("/?auth_callback=success")
        monkeypatch.setattr(main.auth_service, "exchange_code", lambda *_: None)
        accepted = client.get(
            "/api/v1/auth/callback", params={"code": "c", "state": state}, follow_redirects=False
        )
        assert accepted.headers["location"].endswith("/?auth_callback=success")


def test_callback_handles_user_denial_without_exchanging(api, monkeypatch) -> None:
    client, main = api
    state, _ = start_login(client)

    def explode(*_args: object) -> None:  # pragma: no cover - must not run
        raise AssertionError("exchange must not be attempted after a denial")

    monkeypatch.setattr(main.auth_service, "exchange_code", explode)

    response = client.get(
        "/api/v1/auth/callback",
        params={"error": "access_denied", "state": state},
        follow_redirects=False,
    )

    assert response.status_code == 303
    assert response.headers["location"].endswith("/?auth_error=denied")


def test_failed_token_exchange_does_not_leak_upstream_detail(api, monkeypatch) -> None:
    client, main = api
    state, _ = start_login(client)

    def failing_exchange(*_args: object) -> None:
        raise TokenRefreshError("invalid_grant for code SECRET-CODE-VALUE")

    monkeypatch.setattr(main.auth_service, "exchange_code", failing_exchange)

    response = client.get(
        "/api/v1/auth/callback",
        params={"code": "SECRET-CODE-VALUE", "state": state},
        follow_redirects=False,
    )

    assert response.status_code == 303
    location = response.headers["location"]
    assert location.endswith("/?auth_error=exchange_failed")
    assert "SECRET-CODE-VALUE" not in response.text + location
    assert "invalid_grant" not in response.text + location


def test_state_is_consumed_even_when_exchange_fails(api, monkeypatch) -> None:
    client, main = api
    state, _ = start_login(client)
    monkeypatch.setattr(
        main.auth_service,
        "exchange_code",
        lambda *_: (_ for _ in ()).throw(TokenRefreshError("nope")),
    )

    client.get(
        "/api/v1/auth/callback",
        params={"code": "c", "state": state},
        follow_redirects=False,
    )

    replay = client.get(
        "/api/v1/auth/callback", params={"code": "c", "state": state}, follow_redirects=False
    )
    assert replay.headers["location"].endswith("/?auth_error=invalid_state")


def test_pending_state_store_stays_bounded_across_many_logins(api) -> None:
    client, main = api

    for _ in range(52):
        client.get("/api/v1/auth/login", follow_redirects=False)

    import sqlite3

    with sqlite3.connect(main.token_repo.db_path) as connection:
        count = connection.execute("SELECT COUNT(*) FROM oauth_states").fetchone()[0]
    assert count == 52


@pytest.mark.parametrize("path", ["/api/v1/auth/status", "/api/v1/config"])
def test_status_endpoints_never_expose_the_client_id(api, path: str) -> None:
    client, _ = api

    response = client.get(path)

    assert response.status_code == 200
    assert "0123456789abcdef0123456789abcdef" not in response.text


def test_callback_never_returns_a_raw_error_document(api, monkeypatch) -> None:
    """A browser navigation must always land back in the app, never on JSON."""
    client, main = api
    state, _ = start_login(client)

    def explode(*_args: object) -> None:
        raise RuntimeError("unexpected upstream failure")

    monkeypatch.setattr(main.auth_service, "exchange_code", explode)

    response = client.get(
        "/api/v1/auth/callback",
        params={"code": "c", "state": state},
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
    session = main.token_repo.create_session()
    client.cookies.set("spotify_quiz_session", session)

    response = client.get("/api/v1/auth/token")

    assert response.status_code == 200
    assert response.json()["access_token"] == "access-abc"
