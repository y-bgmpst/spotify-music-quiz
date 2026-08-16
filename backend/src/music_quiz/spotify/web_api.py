"""Read-only Spotify Web API catalog.

Used only when a Spotify account is connected. It returns real track URIs, which
is what the browser's Web Playback SDK needs in order to produce audio. Every
network and payload failure is converted into ``CatalogError`` so a route can
answer with the standard error envelope instead of a 500.
"""

from __future__ import annotations

import re
import time
from typing import Any, Callable
from urllib.parse import quote

import httpx

API_BASE = "https://api.spotify.com/v1"
PAGE_LIMIT = 50
MAX_RETRIES = 2
PLAYLIST_ID_PATTERN = re.compile(r"^[A-Za-z0-9]{22}$")


class CatalogError(Exception):
    """Raised when Spotify cannot be read."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class SpotifyWebCatalog:
    """Fetches the signed-in user's playlists and their tracks."""

    def __init__(
        self,
        access_token: Callable[[], str],
        *,
        refresh_access_token: Callable[[], str] | None = None,
        timeout: float = 10.0,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._access_token = access_token
        self._refresh_access_token = refresh_access_token
        self._sleep = sleep
        self._client = httpx.Client(timeout=timeout)

    def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        for attempt in range(MAX_RETRIES + 1):
            try:
                response = self._client.get(
                    f"{API_BASE}{path}",
                    params=params,
                    headers={"Authorization": f"Bearer {self._access_token()}"},
                )
            except httpx.HTTPError as exc:
                raise CatalogError(f"Could not reach Spotify: {type(exc).__name__}") from exc

            if response.status_code == 401 and self._refresh_access_token and attempt == 0:
                self._refresh_access_token()
                continue
            if response.status_code == 429 and attempt < MAX_RETRIES:
                self._sleep(_retry_after(response, attempt))
                continue
            if 500 <= response.status_code <= 599 and attempt < MAX_RETRIES:
                self._sleep(_retry_after(response, attempt, fallback=2**attempt))
                continue
            break

        if response.status_code == 401:
            raise CatalogError("Spotify rejected the stored session.", status_code=401)
        if response.status_code == 403:
            raise CatalogError("Spotify denied access to this resource.", status_code=403)
        if response.status_code == 404:
            raise CatalogError("Spotify resource was not found.", status_code=404)
        if response.status_code != 200:
            raise CatalogError(
                f"Spotify request failed with {response.status_code}.",
                status_code=response.status_code,
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise CatalogError("Spotify sent an unreadable response.") from exc
        if not isinstance(payload, dict):
            raise CatalogError("Spotify sent an unexpected response.")
        return payload

    def playlists(self) -> list[dict[str, object]]:
        result: list[dict[str, object]] = []
        offset = 0
        while True:
            page = self._get("/me/playlists", {"limit": PAGE_LIMIT, "offset": offset})
            items = page.get("items")
            if not isinstance(items, list) or not items:
                break
            for item in items:
                if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                    continue
                owner = item.get("owner")
                tracks = item.get("tracks") or item.get("items")
                images = item.get("images")
                image_url = (
                    next(
                        (
                            image["url"]
                            for image in images
                            if isinstance(image, dict) and isinstance(image.get("url"), str)
                        ),
                        None,
                    )
                    if isinstance(images, list)
                    else None
                )
                result.append(
                    {
                        "id": item["id"],
                        "name": str(item.get("name") or "Untitled playlist"),
                        "owner": str(
                            (owner or {}).get("display_name") if isinstance(owner, dict) else ""
                        ),
                        "total": int((tracks or {}).get("total", 0))
                        if isinstance(tracks, dict)
                        else 0,
                        "image_url": image_url,
                    }
                )
            if not page.get("next"):
                break
            offset += PAGE_LIMIT
        return result

    def playlist_analysis(
        self, playlist_id: str, excerpt_seconds: int, mode: str
    ) -> dict[str, int]:
        total_items = 0
        duplicates_removed = 0
        unavailable_or_unsupported = 0
        too_short_for_excerpt = 0
        unique_uris: set[str] = set()
        offset = 0
        excerpt_ms = excerpt_seconds * 1000
        while True:
            page = self._get(
                _playlist_items_path(playlist_id),
                {
                    "limit": PAGE_LIMIT,
                    "offset": offset,
                    "additional_types": "track",
                    "fields": (
                        "next,items(item(uri,name,duration_ms,explicit,is_playable,"
                        "artists(name),album(name,images(url))))"
                    ),
                },
            )
            items = page.get("items")
            if not isinstance(items, list) or not items:
                break
            for item in items:
                total_items += 1
                track = _track_from_playlist_item(item)
                normalized = _normalize(track)
                if normalized is None:
                    unavailable_or_unsupported += 1
                    continue
                uri = normalized["uri"]
                if not isinstance(uri, str) or uri in unique_uris:
                    duplicates_removed += 1
                    continue
                unique_uris.add(uri)
                duration = normalized.get("duration_ms")
                if isinstance(duration, int) and (
                    duration < excerpt_ms
                    or (mode == "random" and duration < (15 + 20) * 1000 + excerpt_ms)
                ):
                    too_short_for_excerpt += 1
            if not page.get("next"):
                break
            offset += PAGE_LIMIT
        return {
            "total_items": total_items,
            "eligible_unique_tracks": len(unique_uris) - too_short_for_excerpt,
            "duplicates_removed": duplicates_removed,
            "unavailable_or_unsupported": unavailable_or_unsupported,
            "too_short_for_excerpt": too_short_for_excerpt,
        }

    def playlist_items(self, playlist_id: str) -> list[dict[str, object]]:
        result: list[dict[str, object]] = []
        offset = 0
        while True:
            page = self._get(
                _playlist_items_path(playlist_id),
                {
                    "limit": PAGE_LIMIT,
                    "offset": offset,
                    "additional_types": "track",
                    "fields": (
                        "next,items(item(uri,name,duration_ms,explicit,is_playable,"
                        "artists(name),album(name,images(url))))"
                    ),
                },
            )
            items = page.get("items")
            if not isinstance(items, list) or not items:
                break
            for item in items:
                track = _track_from_playlist_item(item)
                normalized = _normalize(track)
                if normalized is not None:
                    result.append(normalized)
            if not page.get("next"):
                break
            offset += PAGE_LIMIT
        return result


def _retry_after(response: httpx.Response, attempt: int, *, fallback: float = 1.0) -> float:
    raw = response.headers.get("Retry-After")
    try:
        delay = float(raw) if raw is not None else fallback
    except ValueError:
        delay = fallback
    return max(0.0, min(delay, 30.0))


def _playlist_items_path(playlist_id: str) -> str:
    if PLAYLIST_ID_PATTERN.fullmatch(playlist_id) is None:
        raise CatalogError("Spotify playlist id is invalid.", status_code=400)
    # The fixed API origin and strict Spotify ID allowlist prevent host/path injection.
    #
    # codeql[py/partial-ssrf]
    return f"/playlists/{quote(playlist_id, safe='')}/items"


def _track_from_playlist_item(item: Any) -> Any:
    if not isinstance(item, dict):
        return None
    return item.get("item") or item.get("track")


def _normalize(track: Any) -> dict[str, object] | None:
    if not isinstance(track, dict):
        return None
    if track.get("is_playable") is False:
        return None
    uri = track.get("uri")
    duration = track.get("duration_ms")
    title = track.get("name")
    if not isinstance(uri, str) or not uri.startswith("spotify:track:"):
        return None
    if not isinstance(duration, int) or not isinstance(title, str):
        return None
    artists = [
        a["name"]
        for a in track.get("artists", [])
        if isinstance(a, dict) and isinstance(a.get("name"), str)
    ]
    if not artists:
        return None
    raw_album = track.get("album")
    album: dict[str, Any] = raw_album if isinstance(raw_album, dict) else {}
    raw_images = album.get("images")
    images: list[Any] = raw_images if isinstance(raw_images, list) else []
    image_url = next(
        (img["url"] for img in images if isinstance(img, dict) and isinstance(img.get("url"), str)),
        None,
    )
    return {
        "uri": uri,
        "title": title,
        "artists": artists,
        "album": str(album.get("name") or "Unknown album"),
        "duration_ms": duration,
        "explicit": bool(track.get("explicit")),
        "image_url": image_url,
    }
