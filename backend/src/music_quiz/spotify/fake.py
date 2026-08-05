from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


class SpotifyCatalog(Protocol):
    def playlists(self) -> list[dict[str, object]]: ...
    def playlist_items(self, playlist_id: str) -> list[dict[str, object]]: ...


@dataclass
class FakeSpotifyCatalog:
    def playlists(self) -> list[dict[str, object]]:
        return [{"id": "fake-playlist", "name": "Fake Hits", "owner": "Test Host", "total": 12}]

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
