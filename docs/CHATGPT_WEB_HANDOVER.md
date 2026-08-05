# ChatGPT Web handover

Updated: 2026-08-05

This is a public, sanitized handover for the next web-based review of Spotify Music Quiz. It contains implementation findings and follow-up work only. Do not add credentials, OAuth tokens, client secrets, local machine paths, or private working notes here.

## What is currently implemented

- Local-first FastAPI backend with SQLite persistence and a React/Vite frontend.
- Deterministic fake Spotify catalog/playback for automated development.
- PKCE helper and Spotify integration boundaries.
- Playlist import from Excel with conservative request pacing, persistent search caching, bounded retries, `Retry-After` support, and batches of up to 100 playlist items.
- Ubuntu and Windows CI workflows.
- A Windows portable package that runs from a writable user folder without Python, Node.js, Git, an installer, or administrator rights.
- Windows 95 / Netscape Navigator-inspired interface documentation and a simple portable-build README guide.
- Answer concealment checks, SQLite persistence tests, and accessibility-oriented browser test coverage.

## Findings and improvements

### 1. Reduce Spotify rate-limit pressure

The importer now reuses one HTTP client, spaces requests, caches successful and not-found searches, honors `Retry-After`, retries only bounded transient failures, and sends track additions in Spotify-supported chunks.

The next improvement should be an explicit import plan before any request is sent:

1. Read and normalize the entire spreadsheet.
2. Deduplicate rows by normalized artist/title/year.
3. Load the local search cache.
4. Resolve only cache misses.
5. Show a preview and ask for confirmation.
6. Create the destination playlist once, then add resolved URIs in chunks.

For importing an already existing Spotify playlist, preserve Spotify track IDs/URIs from the playlist response whenever possible. Do not search again for tracks that already have a usable ID. Playlist pagination is still made up of API requests, so it can still encounter limits, but avoiding unnecessary search calls substantially lowers request volume.

### 2. Complete live Spotify playback verification

Automated tests use the fake adapter. The live Web Playback SDK path still needs a manual test with an eligible Spotify Premium account. Verify login, device readiness, playback, pause/replay, reveal, refresh recovery, token expiry, unavailable tracks, and rate-limit/error messages using the checklist in `docs/live-playback-checklist.md`.

### 3. Keep answer metadata server-authoritative

Before reveal, the frontend must not receive or expose title, artist, album, cover, URI, page metadata, accessibility labels, logs, or media-session metadata. Keep the pre-reveal response minimal and add regression tests whenever the API or UI changes.

### 4. Improve import resilience

Recommended follow-ups:

- make the cache format versioned and validate corrupted cache files gracefully;
- save import progress so an interrupted run can resume without repeating completed work;
- report unresolved rows separately for manual correction;
- use a dry-run mode that never creates or modifies a Spotify playlist;
- add unit tests for `429`, `Retry-After`, timeout, `5xx`, duplicate rows, and cache recovery;
- make the destination playlist name and privacy explicit before creation.

### 5. Verify the Windows package on the target policy

The CI artifact builds and uploads successfully. A real target Windows machine still needs a smoke test from a writable user directory. Confirm that endpoint protection permits the unsigned executable, local browser access to `127.0.0.1:8000` is allowed, and no organization policy blocks user-space applications. The package must not claim to bypass those controls.

## Verified checks

The latest recorded checks passed:

- `make format`
- `make lint`
- `make typecheck`
- `make test` — 16 backend tests and 1 frontend test
- `make build`
- `make verify`
- Python compilation of the importer
- Ruff and mypy for the backend
- Successful Windows portable build and artifact upload in GitHub Actions

No live Spotify request or live playback session was performed during automated verification.

## Recommended next handover steps

1. Review the current diff and public file list for accidental internal material.
2. Run the importer in dry-run mode after that mode is implemented.
3. Add playlist-ID-preserving import support.
4. Run the live playback checklist with test credentials kept outside Git.
5. Test the downloaded Windows artifact on the intended standard-user laptop.
6. Update this handover with exact command output and unresolved findings.

