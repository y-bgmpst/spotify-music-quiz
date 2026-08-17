"""Configuration validation, especially around the Spotify Client ID."""

from __future__ import annotations

from music_quiz.config import load_settings

VALID = "0123456789abcdef0123456789abcdef"


def test_valid_client_id_is_accepted() -> None:
    settings = load_settings({"SPOTIFY_CLIENT_ID": VALID})
    assert settings.spotify_client_id == VALID
    assert settings.problems == ()


def test_surrounding_quotes_and_whitespace_are_stripped() -> None:
    settings = load_settings({"SPOTIFY_CLIENT_ID": f'  "{VALID}"  '})
    assert settings.spotify_client_id == VALID
    assert settings.problems == ()


def test_uppercase_or_truncated_client_id_is_rejected() -> None:
    settings = load_settings({"SPOTIFY_CLIENT_ID": VALID.upper()})
    assert settings.spotify_client_id == ""
    assert any("not a valid Spotify Client ID" in p for p in settings.problems)


def test_placeholder_client_id_is_rejected_with_a_specific_hint() -> None:
    settings = load_settings({"SPOTIFY_CLIENT_ID": "your-client-id-here"})
    assert settings.spotify_client_id == ""
    assert any("placeholder" in p for p in settings.problems)


def test_problem_message_never_contains_the_configured_value() -> None:
    settings = load_settings({"SPOTIFY_CLIENT_ID": "secret-looking-value"})
    assert all("secret-looking-value" not in p for p in settings.problems)


def test_missing_client_id_reports_not_set() -> None:
    settings = load_settings({})
    assert any("is not set" in p for p in settings.problems)


def test_quoted_redirect_uri_is_unquoted() -> None:
    settings = load_settings({"SPOTIFY_REDIRECT_URI": '"http://127.0.0.1:8000/cb"'})
    assert settings.redirect_uri == "http://127.0.0.1:8000/cb"


def test_fake_spotify_mode_is_explicit() -> None:
    assert load_settings({"FAKE_SPOTIFY": "true"}).fake_spotify is True
    assert load_settings({"FAKE_SPOTIFY": "false"}).fake_spotify is False
