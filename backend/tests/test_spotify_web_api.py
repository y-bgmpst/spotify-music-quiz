from __future__ import annotations

import httpx

from music_quiz.spotify.web_api import SpotifyWebCatalog


def catalog_with(responses: list[httpx.Response], **kwargs: object) -> SpotifyWebCatalog:
    def handler(request: httpx.Request) -> httpx.Response:
        response = responses.pop(0)
        response.request = request
        return response

    catalog = SpotifyWebCatalog(lambda: "access-token", **kwargs)
    catalog._client = httpx.Client(transport=httpx.MockTransport(handler))
    return catalog


def test_playlist_items_follow_all_pages_without_a_500_item_cap() -> None:
    def page(start: int, next_page: bool) -> httpx.Response:
        item = {
            "track": {
                "uri": f"spotify:track:{start}",
                "name": f"Track {start}",
                "duration_ms": 180000,
                "artists": [{"name": "Artist"}],
                "album": {"name": "Album", "images": []},
            }
        }
        return httpx.Response(
            200,
            json={"items": [item], "next": "next" if next_page else None},
        )

    responses = [page(index, index < 501) for index in range(0, 502)]
    catalog = catalog_with(responses)

    items = catalog.playlist_items("playlist")

    assert len(items) == 502


def test_429_respects_retry_after_and_is_bounded() -> None:
    delays: list[float] = []
    catalog = catalog_with(
        [httpx.Response(429, headers={"Retry-After": "3"})] * 2
        + [httpx.Response(200, json={"items": [], "next": None})],
        sleep=delays.append,
    )

    assert catalog.playlist_items("playlist") == []
    assert delays == [3.0, 3.0]


def test_5xx_retry_uses_bounded_backoff_and_returns_catalog_error() -> None:
    delays: list[float] = []
    catalog = catalog_with(
        [httpx.Response(503)] * 3,
        sleep=delays.append,
    )

    try:
        catalog.playlist_items("playlist")
    except Exception as exc:
        assert type(exc).__name__ == "CatalogError"
        assert "503" in str(exc)
    else:
        raise AssertionError("expected CatalogError")
    assert delays == [1.0, 2.0]


def test_401_refreshes_once_before_retrying() -> None:
    refreshed: list[bool] = []
    catalog = catalog_with(
        [
            httpx.Response(401),
            httpx.Response(200, json={"items": [], "next": None}),
        ],
        refresh_access_token=lambda: refreshed.append(True) or "new-token",
    )

    assert catalog.playlist_items("playlist") == []
    assert refreshed == [True]
