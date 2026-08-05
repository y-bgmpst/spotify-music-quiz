#!/usr/bin/env python3
"""
Batch-Import: Excel → Spotify Playlist (Rate-Limit-Safe)
Imports tracks in small batches with delays between batches
"""

import json
import random
import sys
import time
from pathlib import Path

import httpx
import openpyxl
import sqlite3


BATCH_SIZE = 10  # Tracks per progress checkpoint
BATCH_DELAY = 5  # Seconds between checkpoints
MIN_REQUEST_INTERVAL = 1.0  # Conservative pacing for Spotify's rolling window
MAX_RETRIES = 4
CACHE_PATH = Path(".data/spotify-search-cache.json")


class SpotifyClient:
    """Shared client with pacing, bounded retries, and Retry-After handling."""

    def __init__(self, token: str) -> None:
        self._client = httpx.Client(
            base_url="https://api.spotify.com/v1",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        self._next_request_at = 0.0

    def close(self) -> None:
        self._client.close()

    def request(self, method: str, path: str, **kwargs: object) -> httpx.Response:
        for attempt in range(MAX_RETRIES + 1):
            wait = self._next_request_at - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._next_request_at = time.monotonic() + MIN_REQUEST_INTERVAL

            try:
                response = self._client.request(method, path, **kwargs)
            except httpx.RequestError:
                if attempt == MAX_RETRIES:
                    raise
                time.sleep(min(30.0, 2**attempt) + random.uniform(0, 0.5))
                continue

            if response.status_code == 429:
                retry_after = _retry_after_seconds(response)
                if attempt == MAX_RETRIES:
                    response.raise_for_status()
                self._next_request_at = max(
                    self._next_request_at, time.monotonic() + retry_after
                )
                print(f"   ⚠️  Rate limited. Waiting {retry_after:.0f}s before retry...")
                continue

            if response.status_code >= 500 and attempt < MAX_RETRIES:
                time.sleep(min(30.0, 2**attempt) + random.uniform(0, 0.5))
                continue

            response.raise_for_status()
            return response

        raise RuntimeError("Spotify request exhausted retry budget")


def _retry_after_seconds(response: httpx.Response) -> float:
    try:
        return max(1.0, float(response.headers.get("Retry-After", "60")))
    except ValueError:
        return 60.0


def load_search_cache() -> dict[str, str | None]:
    if not CACHE_PATH.exists():
        return {}
    try:
        data = json.loads(CACHE_PATH.read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_search_cache(cache: dict[str, str | None]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = CACHE_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(cache, indent=2, sort_keys=True))
    temporary.replace(CACHE_PATH)


def cache_key(artist: str, title: str, year: int | None) -> str:
    return "|".join((artist.strip().casefold(), title.strip().casefold(), str(year or "")))


def get_token():
    """Get token from database"""
    db_path = Path(".data/quiz.db")
    if not db_path.exists():
        print("❌ Database not found. Please login first.")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    cursor = conn.execute("SELECT access_token FROM auth_tokens ORDER BY updated_at DESC LIMIT 1")
    row = cursor.fetchone()
    conn.close()

    if not row:
        print("❌ No access token found. Please login via web UI first.")
        sys.exit(1)

    return row[0]


def load_tracks_from_excel(file_path: str) -> list[dict]:
    """Load tracks from Excel file"""
    wb = openpyxl.load_workbook(file_path)
    ws = wb.active

    tracks = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row[0]:  # Skip empty rows
            continue
        tracks.append({
            "rank": row[0],
            "title": row[1],  # Titel is column 1
            "artist": row[2],  # Künstler is column 2
            "year": row[3],
        })

    return tracks


def search_track(
    artist: str,
    title: str,
    year: int | None,
    spotify: SpotifyClient,
    cache: dict[str, str | None],
) -> str | None:
    """Search for track on Spotify and return URI"""
    key = cache_key(artist, title, year)
    if key in cache:
        return cache[key]

    query = f"artist:{artist} track:{title}"
    if year:
        query += f" year:{year}"

    response = spotify.request(
        "GET", "/search", params={"q": query, "type": "track", "limit": 1}
    )
    items = response.json().get("tracks", {}).get("items", [])
    uri = items[0].get("uri") if items else None
    cache[key] = uri
    save_search_cache(cache)
    return uri


def get_user_id(spotify: SpotifyClient) -> str:
    """Get current user's Spotify ID"""
    response = spotify.request("GET", "/me")
    return response.json()["id"]


def create_playlist(name: str, description: str, spotify: SpotifyClient) -> str:
    """Create a new private playlist"""
    response = spotify.request(
        "POST",
        "/me/playlists",
        json={
            "name": name,
            "description": description,
            "public": False,
        },
    )
    return response.json()["id"]


def add_tracks_to_playlist(playlist_id: str, track_uris: list[str], spotify: SpotifyClient):
    """Add tracks to playlist (max 100 at a time)"""
    spotify.request(
        "POST",
        f"/playlists/{playlist_id}/items",
        json={"uris": track_uris},
    )


def main():
    print("=" * 60)
    print("🎵 Spotify Playlist Batch Importer - 90s Edition")
    print("=" * 60)
    print()

    token = get_token()
    spotify = SpotifyClient(token)
    cache = load_search_cache()
    print("✓ Access token loaded")
    print()

    # Load Excel
    excel_path = Path(__file__).parent.parent / "Top100_90er_Weltweit_Deutschland_Frankfurt.xlsx"
    if not excel_path.exists():
        excel_path = Path.home() / "Downloads" / "Top100_90er_Weltweit_Deutschland_Frankfurt.xlsx"

    if not excel_path.exists():
        print(f"❌ Excel file not found at: {excel_path}")
        sys.exit(1)

    print(f"📂 Loading playlist: {excel_path}")
    tracks = load_tracks_from_excel(str(excel_path))
    print(f"✓ Found {len(tracks)} tracks")
    print()

    # Search tracks in batches
    print(f"🔍 Searching tracks (Batch size: {BATCH_SIZE}, Delay: {BATCH_DELAY}s)...")
    print()

    found_uris = []
    not_found = []

    for i, track in enumerate(tracks, 1):
        batch_num = (i - 1) // BATCH_SIZE + 1
        print(f"[{i:3d}/{len(tracks)}] {track['artist']} - {track['title']} ({track['year']})...", end=" ", flush=True)

        uri = search_track(track["artist"], track["title"], track["year"], spotify, cache)

        if uri:
            found_uris.append(uri)
            print("✓")
        else:
            not_found.append(f"{track['artist']} - {track['title']}")
            print("❌")

        # Pause between batches
        if i % BATCH_SIZE == 0 and i < len(tracks):
            print()
            print(f"   💤 Batch {batch_num} complete. Waiting {BATCH_DELAY}s before next batch...")
            print()
            time.sleep(BATCH_DELAY)

    print()
    print("=" * 60)
    print(f"✓ Found: {len(found_uris)}/{len(tracks)} tracks")
    if not_found:
        print(f"⚠️  Not found: {len(not_found)} tracks")
        print("   (These will be skipped)")
    print()

    if not found_uris:
        print("❌ No tracks found. Exiting.")
        sys.exit(1)

    # Create playlist
    print("📝 Creating Spotify playlist...")
    user_id = get_user_id(spotify)
    playlist_id = create_playlist(
        "Top 100 - 90er (Imported)",
        "Top 100 Tracks aus den 90ern - Weltweit, Deutschland, Frankfurt - Imported via Batch Script",
        spotify,
    )
    print(f"✓ Playlist created: {playlist_id}")
    print()

    # Add tracks in chunks of 100 (Spotify limit)
    print("📥 Adding tracks to playlist...")
    for i in range(0, len(found_uris), 100):
        chunk = found_uris[i:i + 100]
        add_tracks_to_playlist(playlist_id, chunk, spotify)
        print(f"   Added {min(i + 100, len(found_uris))}/{len(found_uris)} tracks")

    print()
    print("=" * 60)
    print("✅ SUCCESS!")
    print(f"🎵 Playlist created with {len(found_uris)} tracks")
    print(f"🔗 https://open.spotify.com/playlist/{playlist_id}")
    print("=" * 60)
    spotify.close()


if __name__ == "__main__":
    main()
