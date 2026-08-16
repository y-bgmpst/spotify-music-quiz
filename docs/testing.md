# Testing

Automated checks do not need Spotify credentials:

```sh
make setup
make format
make lint
make typecheck
make test
make e2e
make build
```

The backend tests cover queue determinism, normalization, excerpt boundaries, legal state transitions, scoring, fake adapter pagination, and the mocked OAuth lifecycle: PKCE URL generation, persistent session-bound state, cross-session and cookie rejection, parallel pending logins in both callback orders, one-time callback consumption, atomic concurrent consume, token exchange against an HTTP mock, SQLite token persistence, session rotation, `/auth/status`, `/auth/token`, reload, expiry, and unusable-token failure. Token-exchange failure is tested after consume to prove replay remains impossible. Frontend tests cover credentialed API requests, concealment, reveal, repeated starts, timer cleanup, deriving connected state from `/auth/status` rather than the callback query, and sanitized Web Playback SDK `not_ready`/`playback_error` handling. Live Web Playback remains manual because it requires a Premium account and browser DRM support.

## Running E2E Tests

E2E tests require both backend and frontend servers running:

```sh
# Terminal 1: Start backend
.venv/bin/uvicorn music_quiz.main:app --reload --app-dir backend/src

# Terminal 2: Run E2E tests
npm --prefix frontend run e2e
```

The Playwright configuration starts the Vite frontend in explicit `VITE_FAKE_SPOTIFY=true` mode. Start the backend with `FAKE_SPOTIFY=true` before running it. The E2E test suite includes:
- Complete game flow (create, play, pause, resume, reveal, next round, finish)
- Answer concealment validation (metadata not leaked before reveal)
- Accessibility audits (WCAG compliance, keyboard navigation, screen reader support)
- OAuth callback success/failure derivation from the backend auth status
- Real-mode playlist selection is covered structurally by the typed `/playlists` client and selected `playlist_id` request path; live Spotify data remains manual.

Frontend unit tests cover credentialed playlist loading, keyboard-operable selection, eligibility summaries, zero-eligible blocking, and safe error handling in addition to the game flow. Live Spotify OAuth and playlist loading have been manually verified; SDK device lifecycle and audio playback remain manual. Spotify Web API hardening tests cover full pagination, bounded 401 refresh, 429 `Retry-After`, 5xx backoff, and eligibility classification using HTTP mocks.
