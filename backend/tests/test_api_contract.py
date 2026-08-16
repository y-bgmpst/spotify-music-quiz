"""API contract: error envelope, answer concealment, scoring, and the clock."""

from __future__ import annotations


def create_game(client, **overrides) -> dict:
    body = {"rounds": 3, "excerpt_seconds": 10, "participants": ["Team A", "Team B"], "seed": 7}
    body.update(overrides)
    response = client.post("/api/v1/games", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_health_and_config_report_readiness(api) -> None:
    client, _ = api

    assert client.get("/api/v1/health").json()["status"] == "ok"
    config = client.get("/api/v1/config").json()
    assert config["spotify_client_id_configured"] is True
    assert config["playback_implemented"] is True


def test_unknown_game_returns_the_error_envelope(api) -> None:
    client, _ = api

    response = client.get("/api/v1/games/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "game_not_found", "message": "That game does not exist."}
    }


def test_invalid_payload_returns_the_error_envelope(api) -> None:
    client, _ = api

    response = client.post("/api/v1/games", json={"rounds": 0})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_request"


def test_invalid_transition_returns_409_envelope(api) -> None:
    client, _ = api
    game = create_game(client)

    response = client.post(f"/api/v1/games/{game['id']}/round/next")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "invalid_state_transition"


def test_answer_is_concealed_until_reveal(api) -> None:
    client, _ = api
    game = create_game(client)
    game_id = game["id"]

    assert "answer" not in game
    assert "answer" not in client.get(f"/api/v1/games/{game_id}").json()

    playing = client.post(f"/api/v1/games/{game_id}/round/start").json()
    assert "answer" not in playing

    paused = client.post(f"/api/v1/games/{game_id}/round/pause").json()
    assert "answer" not in paused

    revealed = client.post(f"/api/v1/games/{game_id}/round/reveal").json()
    assert revealed["answer"]["title"]
    assert revealed["answer"]["artists"]

    # And it stays visible on a plain re-read of the revealed round.
    assert "answer" in client.get(f"/api/v1/games/{game_id}").json()

    advanced = client.post(f"/api/v1/games/{game_id}/round/next").json()
    assert "answer" not in advanced


def test_excerpt_clock_is_server_authoritative(api) -> None:
    client, _ = api
    game_id = create_game(client, excerpt_seconds=10)["id"]

    ready = client.get(f"/api/v1/games/{game_id}").json()
    assert ready["excerpt_remaining_ms"] == 0
    assert ready["excerpt_deadline_ms"] is None

    playing = client.post(f"/api/v1/games/{game_id}/round/start").json()
    assert playing["excerpt_deadline_ms"] is not None
    assert 9000 < playing["excerpt_remaining_ms"] <= 10000

    paused = client.post(f"/api/v1/games/{game_id}/round/pause").json()
    assert paused["excerpt_deadline_ms"] is None
    frozen = paused["excerpt_remaining_ms"]
    assert client.get(f"/api/v1/games/{game_id}").json()["excerpt_remaining_ms"] == frozen

    resumed = client.post(f"/api/v1/games/{game_id}/round/resume").json()
    assert resumed["excerpt_deadline_ms"] is not None

    revealed = client.post(f"/api/v1/games/{game_id}/round/reveal").json()
    assert revealed["excerpt_remaining_ms"] == 0
    assert revealed["excerpt_deadline_ms"] is None


def test_scoring_requires_reveal(api) -> None:
    client, _ = api
    game = create_game(client)
    participant = game["participants"][0]["id"]

    response = client.post(
        f"/api/v1/games/{game['id']}/scores",
        json={"participant_id": participant, "points": 1, "reason": "title"},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "score_rejected"


def test_award_and_reverse_score_persist(api) -> None:
    client, _ = api
    game = create_game(client)
    game_id = game["id"]
    participant = game["participants"][0]["id"]
    client.post(f"/api/v1/games/{game_id}/round/start")
    client.post(f"/api/v1/games/{game_id}/round/reveal")

    awarded = client.post(
        f"/api/v1/games/{game_id}/scores",
        json={"participant_id": participant, "points": 2, "reason": "title+artist"},
    ).json()
    scored = next(p for p in awarded["participants"] if p["id"] == participant)
    assert scored["score"] == 2
    event_id = awarded["score_events"][0]["id"]

    reloaded = client.get(f"/api/v1/games/{game_id}").json()
    assert next(p for p in reloaded["participants"] if p["id"] == participant)["score"] == 2

    reversed_state = client.post(f"/api/v1/games/{game_id}/scores/{event_id}/reverse").json()
    assert next(p for p in reversed_state["participants"] if p["id"] == participant)["score"] == 0
    assert reversed_state["score_events"][0]["reversed"] is True

    again = client.post(f"/api/v1/games/{game_id}/scores/{event_id}/reverse")
    assert again.status_code == 409


def test_score_award_is_idempotent_for_a_client_supplied_event_id(api) -> None:
    client, _ = api
    game = create_game(client)
    game_id = game["id"]
    participant = game["participants"][0]["id"]
    client.post(f"/api/v1/games/{game_id}/round/start")
    client.post(f"/api/v1/games/{game_id}/round/reveal")
    body = {
        "participant_id": participant,
        "points": 1,
        "reason": "title",
        "event_id": "11111111-1111-1111-1111-111111111111",
    }

    client.post(f"/api/v1/games/{game_id}/scores", json=body)
    second = client.post(f"/api/v1/games/{game_id}/scores", json=body).json()

    assert len(second["score_events"]) == 1
    assert next(p for p in second["participants"] if p["id"] == participant)["score"] == 1


def test_cors_allows_the_configured_origin_only(api) -> None:
    client, _ = api

    allowed = client.get("/api/v1/health", headers={"Origin": "http://127.0.0.1:5173"})
    assert allowed.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"

    denied = client.get("/api/v1/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in denied.headers


def test_cors_preflight_does_not_wildcard(api) -> None:
    client, _ = api

    response = client.options(
        "/api/v1/games",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.headers.get("access-control-allow-origin") != "*"


def test_live_playlist_endpoint_requires_an_authenticated_session(api, monkeypatch) -> None:
    client, main = api
    from dataclasses import replace

    monkeypatch.setattr(main, "settings", replace(main.settings, fake_spotify=False))
    response = client.get("/api/v1/playlists")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "spotify_not_authenticated"
