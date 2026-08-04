#!/usr/bin/env python3
"""
Batch-Import: Excel → Spotify Playlist (Rate-Limit-Safe)
Imports tracks in small batches with delays between batches
"""

import os
import sys
import time
from pathlib import Path

import httpx
import openpyxl
import sqlite3


BATCH_SIZE = 10  # Tracks per batch
BATCH_DELAY = 5  # Seconds between batches
SEARCH_DELAY = 0.6  # Seconds between individual searches


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
            "artist": row[1],
            "title": row[2],
            "year": row[3],
        })

    return tracks


def search_track(artist: str, title: str, year: int, token: str) -> str | None:
    """Search for track on Spotify and return URI"""
    query = f"artist:{artist} track:{title} year:{year}"

    try:
        time.sleep(SEARCH_DELAY)

        response = httpx.get(
            "https://api.spotify.com/v1/search",
            params={"q": query, "type": "track", "limit": 1},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )

        if response.status_code == 429:
            retry_after = int(response.headers.get("Retry-After", 60))
            print(f"   ⚠️  Rate limited! Waiting {retry_after}s...")
            time.sleep(retry_after)
            return search_track(artist, title, year, token)  # Retry

        response.raise_for_status()
        data = response.json()

        if data["tracks"]["items"]:
            return data["tracks"]["items"][0]["uri"]

        return None

    except Exception as e:
        print(f"   ⚠️  Search failed: {e}")
        return None


def get_user_id(token: str) -> str:
    """Get current user's Spotify ID"""
    response = httpx.get(
        "https://api.spotify.com/v1/me",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()["id"]


def create_playlist(user_id: str, name: str, description: str, token: str) -> str:
    """Create a new private playlist"""
    response = httpx.post(
        f"https://api.spotify.com/v1/users/{user_id}/playlists",
        json={
            "name": name,
            "description": description,
            "public": False,
        },
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()["id"]


def add_tracks_to_playlist(playlist_id: str, track_uris: list[str], token: str):
    """Add tracks to playlist (max 100 at a time)"""
    response = httpx.post(
        f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks",
        json={"uris": track_uris},
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    response.raise_for_status()


def main():
    print("=" * 60)
    print("🎵 Spotify Playlist Batch Importer - 90s Edition")
    print("=" * 60)
    print()

    token = get_token()
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

        uri = search_track(track["artist"], track["title"], track["year"], token)

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
    user_id = get_user_id(token)
    playlist_id = create_playlist(
        user_id,
        "Top 100 - 90er (Imported)",
        "Top 100 Tracks aus den 90ern - Weltweit, Deutschland, Frankfurt - Imported via Batch Script",
        token,
    )
    print(f"✓ Playlist created: {playlist_id}")
    print()

    # Add tracks in chunks of 100 (Spotify limit)
    print("📥 Adding tracks to playlist...")
    for i in range(0, len(found_uris), 100):
        chunk = found_uris[i:i + 100]
        add_tracks_to_playlist(playlist_id, chunk, token)
        print(f"   Added {min(i + 100, len(found_uris))}/{len(found_uris)} tracks")

    print()
    print("=" * 60)
    print("✅ SUCCESS!")
    print(f"🎵 Playlist created with {len(found_uris)} tracks")
    print(f"🔗 https://open.spotify.com/playlist/{playlist_id}")
    print("=" * 60)


if __name__ == "__main__":
    main()
