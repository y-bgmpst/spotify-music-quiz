#!/usr/bin/env python3
"""
Find public 90s playlists on Spotify
"""

import os
import sys
from pathlib import Path

import httpx
import sqlite3


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


def search_playlists(query: str, token: str, limit: int = 10):
    """Search for public playlists"""
    response = httpx.get(
        "https://api.spotify.com/v1/search",
        params={"q": query, "type": "playlist", "limit": limit},
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()["playlists"]["items"]


def main():
    print("=" * 70)
    print("🎵 90s Playlist Finder")
    print("=" * 70)
    print()

    token = get_token()
    print("✓ Access token loaded")
    print()

    queries = [
        "90s hits top 100",
        "90s USA hits",
        "90s Europe classics",
        "90s Germany hits",
        "best of 90s",
    ]

    all_playlists = []

    for query in queries:
        print(f"🔍 Searching: {query}")
        try:
            playlists = search_playlists(query, token, limit=5)
            all_playlists.extend(playlists)
            print(f"   Found {len(playlists)} playlists")
        except Exception as e:
            print(f"   ⚠️  Error: {e}")

    print()
    print("=" * 70)
    print(f"📋 Top 90s Playlists ({len(all_playlists)} found)")
    print("=" * 70)
    print()

    # Sort by follower count
    all_playlists.sort(key=lambda p: p.get("tracks", {}).get("total", 0), reverse=True)

    for i, playlist in enumerate(all_playlists[:15], 1):
        name = playlist["name"]
        owner = playlist["owner"]["display_name"]
        tracks = playlist["tracks"]["total"]
        playlist_id = playlist["id"]
        url = playlist["external_urls"]["spotify"]

        print(f"[{i:2d}] {name}")
        print(f"     Owner: {owner} | Tracks: {tracks}")
        print(f"     ID: {playlist_id}")
        print(f"     URL: {url}")
        print()

    print("=" * 70)
    print("💡 Copy a playlist ID to use in the quiz backend!")
    print()


if __name__ == "__main__":
    main()
