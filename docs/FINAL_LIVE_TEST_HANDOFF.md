# Final Live Spotify Test Handoff

Stand: 2026-08-10  
Branch: `agent/oauth-session-ci-debug-pr`  
HEAD: `b4080d129d2137729a24c7fba0c347ab4c04c37f`

## Status

Automated checks are green:

- Backend: 27 tests
- Frontend unit: 7 tests
- Playwright: 24 passed, 0 failed
- `make verify`: passed
- `git diff --check`: passed

OAuth/session, explicit fake/real mode, real playlist selection, Web API pagination and retry hardening are implemented. No live Spotify credentials were entered or exposed.

## Start for tomorrow

Use two terminals from the repository root. Ensure no old backend/frontend processes are running.

Terminal 1 — real backend:

```bash
FAKE_SPOTIFY=false FRONTEND_ORIGIN=http://127.0.0.1:5173 \
  .venv/bin/uvicorn music_quiz.main:app --app-dir backend/src \
  --host 127.0.0.1 --port 8000
```

Terminal 2 — real frontend:

```bash
VITE_FAKE_SPOTIFY=false npm --prefix frontend run dev -- --host 127.0.0.1
```

Open:

```text
http://127.0.0.1:5173/
```

The configured Spotify redirect URI must be exactly:

```text
http://127.0.0.1:8000/api/v1/auth/callback
```

Do not print or copy values from `.env`.

## Live test sequence

1. Click `Spotify Login`.
2. Complete Spotify login and consent manually.
3. Confirm the browser returns to the frontend with a connected message.
4. Check `/api/v1/auth/status` in the browser network panel; it must return `authenticated: true`.
5. Reload the page; connected state must remain visible.
6. Confirm real Spotify playlists load and select an actual playlist.
7. Create a game and verify the request contains the selected real `playlist_id`, never `fake-playlist`.
8. Start at least three rounds and verify `ready`, `device_id`, playback, pause, resume, reveal and next-round behavior.
9. Before Reveal, inspect the DOM and network response: title, artist, album, cover and answer metadata must remain concealed.
10. Reveal the answer and verify metadata appears only then.
11. Test logout. `/auth/status` must become false, `/auth/token` must return 401, and reload must remain signed out.

Record only boolean/status results. Do not record access tokens, refresh tokens, OAuth code/state, PKCE verifier, session cookies or authorization headers.

## Playback error checks

Automated coverage exists for:

- `not_ready`: device/readiness is invalidated and the UI receives a recoverable error.
- `playback_error`: the UI receives only the sanitized message `Spotify playback failed.`.

If a natural live event occurs, record the visible behavior only. Do not force invalid Spotify requests to manufacture an error.

## Result template

```text
Live Spotify OAuth: PASS / FAIL / NOT TESTED
Callback and authenticated status: PASS / FAIL / NOT TESTED
Reload persistence: PASS / FAIL / NOT TESTED
Real playlist loading: PASS / FAIL / NOT TESTED
Real playlist_id game creation: PASS / FAIL / NOT TESTED
Spotify.Player ready: PASS / FAIL / NOT TESTED
Audio playback: PASS / FAIL / NOT TESTED
Pause/resume: PASS / FAIL / NOT TESTED
Reveal/next round: PASS / FAIL / NOT TESTED
Answer concealment: PASS / FAIL / NOT TESTED
Logout: PASS / FAIL / NOT TESTED
Live token refresh: PASS / FAIL / NOT TESTED
Portable Windows OAuth: PASS / FAIL / NOT TESTED
```

Final classification:

```text
MERGE READY
MERGE READY EXCEPT PORTABLE WINDOWS MANUAL TEST
MERGE READY EXCEPT LIVE SPOTIFY MANUAL TEST
NOT MERGE READY
```

Do not commit or push as part of tomorrow's test unless explicitly requested.
