#!/usr/bin/env python3
"""
Import 90s playlist from Excel to Spotify
Creates a private playlist in your Spotify account
"""

import os
import sys
from pathlib import Path

import pandas as pd
import httpx


def load_playlist(excel_path: str) -> pd.DataFrame:
    """Load playlist from Excel file"""
    print(f"📂 Loading playlist: {excel_path}")
    df = pd.read_excel(excel_path)
    print(f"✓ Found {len(df)} tracks")
    return df


def search_track(artist: str, title: str, year: int, token: str) -> str | None:
    """Search for track on Spotify and return URI"""
    import time

    query = f"artist:{artist} track:{title} year:{year}"

    try:
        # Rate limiting: wait 0.5s between requests
        time.sleep(0.5)

        response = httpx.get(
            "https://api.spotify.com/v1/search",
            params={"q": query, "type": "track", "limit": 1},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )

        if response.status_code != 200:
            print(f"  ⚠️  Search failed: {response.status_code}")
            return None

        data = response.json()
        items = data.get("tracks", {}).get("items", [])

        if not items:
            # Try without year
            query_fallback = f"artist:{artist} track:{title}"
            response = httpx.get(
                "https://api.spotify.com/v1/search",
                params={"q": query_fallback, "type": "track", "limit": 1},
                headers={"Authorization": f"Bearer {token}"},
                timeout=10,
            )

            if response.status_code == 200:
                items = response.json().get("tracks", {}).get("items", [])

        if items:
            return items[0]["uri"]
        return None

    except Exception as e:
        print(f"  ❌ Error: {e}")
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
    """Create new private playlist"""
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


def add_tracks(playlist_id: str, uris: list[str], token: str) -> None:
    """Add tracks to playlist (max 100 per request)"""
    # Spotify API limit: 100 tracks per request
    for i in range(0, len(uris), 100):
        chunk = uris[i:i+100]
        response = httpx.post(
            f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks",
            json={"uris": chunk},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        response.raise_for_status()


def main():
    print("=" * 60)
    print("🎵 Spotify Playlist Importer - 90s Edition")
    print("=" * 60)
    print()

    # Get token from database
    db_path = Path(".data/quiz.db")
    if not db_path.exists():
        print("❌ Database not found. Please login first:")
        print("   1. Start backend: make run-backend")
        print("   2. Open browser: http://127.0.0.1:8000/")
        print("   3. Click 'Login' and authorize")
        print("   4. Run this script again")
        sys.exit(1)

    import sqlite3
    conn = sqlite3.connect(db_path)
    cursor = conn.execute("SELECT access_token FROM auth_tokens ORDER BY updated_at DESC LIMIT 1")
    row = cursor.fetchone()
    conn.close()

    if not row:
        print("❌ No access token found. Please login via web UI first.")
        sys.exit(1)

    token = row[0]
    print("✓ Access token loaded")
    print()

    # Load playlist
    excel_path = "/home/rhax/Downloads/Top100_90er_Weltweit_Deutschland_Frankfurt.xlsx"
    df = load_playlist(excel_path)
    print()

    # Search tracks
    print("🔍 Searching tracks on Spotify...")
    found_uris = []
    not_found = []

    for idx, row in df.iterrows():
        rank = row["Rang"]
        title = row["Titel"]
        artist = row["Künstler"]
        year = int(row["Jahr"]) if pd.notna(row["Jahr"]) else None

        print(f"[{rank:3d}/100] {artist} - {title} ({year})...", end=" ")

        uri = search_track(artist, title, year, token)
        if uri:
            found_uris.append(uri)
            print("✓")
        else:
            not_found.append((rank, artist, title))
            print("❌")

    print()
    print(f"✓ Found: {len(found_uris)}/{len(df)} tracks")

    if not_found:
        print(f"⚠️  Not found: {len(not_found)} tracks")
        print("   (These will be skipped)")

    if not found_uris:
        print("❌ No tracks found. Exiting.")
        sys.exit(1)

    print()

    # Create playlist
    print("📝 Creating Spotify playlist...")
    user_id = get_user_id(token)
    playlist_id = create_playlist(
        user_id,
        "Top 100 - 90er Weltweit/Deutschland/Frankfurt",
        "Die besten 90er Hits aus aller Welt, Deutschland und Frankfurt. "
        "Automatisch importiert für das Spotify Music Quiz.",
        token,
    )
    print(f"✓ Playlist created: {playlist_id}")
    print()

    # Add tracks
    print("🎵 Adding tracks to playlist...")
    add_tracks(playlist_id, found_uris, token)
    print(f"✓ Added {len(found_uris)} tracks")
    print()

    # Summary
    print("=" * 60)
    print("✅ IMPORT COMPLETE!")
    print("=" * 60)
    print()
    print(f"Playlist: Top 100 - 90er Weltweit/Deutschland/Frankfurt")
    print(f"Tracks: {len(found_uris)}/{len(df)}")
    print()
    print("Open in Spotify:")
    print(f"https://open.spotify.com/playlist/{playlist_id}")
    print()

    if not_found:
        print("⚠️  Tracks not found on Spotify:")
        for rank, artist, title in not_found[:10]:
            print(f"   [{rank:3d}] {artist} - {title}")
        if len(not_found) > 10:
            print(f"   ... and {len(not_found) - 10} more")

    print()


if __name__ == "__main__":
    main()
