from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


class SpotifyCatalog(Protocol):
    def playlists(self) -> list[dict[str, object]]: ...
    def playlist_items(self, playlist_id: str) -> list[dict[str, object]]: ...
    def playlist_analysis(
        self, playlist_id: str, excerpt_seconds: int, mode: str
    ) -> dict[str, int]: ...


@dataclass
class FakeSpotifyCatalog:
    def playlists(self) -> list[dict[str, object]]:
        return [
            {
                "id": "fake-playlist",
                "name": "Fake Hits",
                "owner": "Test Host",
                "total": 12,
                "image_url": None,
            }
        ]

    def playlist_items(self, playlist_id: str) -> list[dict[str, object]]:
        if playlist_id != "fake-playlist":
            return []
        return [
            {
                "uri": f"spotify:track:{i}",
                "title": f"Track {i}",
                "artists": [f"Artist {i}"],
                "album": "Fake Album",
                "duration_ms": 240000,
                "explicit": False,
            }
            for i in range(12)
        ]

    def playlist_analysis(
        self, playlist_id: str, excerpt_seconds: int, mode: str
    ) -> dict[str, int]:
        items = self.playlist_items(playlist_id)
        unique = {item["uri"] for item in items if isinstance(item.get("uri"), str)}
        too_short = 0
        for item in items:
            duration = item.get("duration_ms")
            if isinstance(duration, int) and duration < excerpt_seconds * 1000:
                too_short += 1
        return {
            "total_items": len(items),
            "eligible_unique_tracks": len(unique) - too_short,
            "duplicates_removed": len(items) - len(unique),
            "unavailable_or_unsupported": 0,
            "too_short_for_excerpt": too_short,
        }
