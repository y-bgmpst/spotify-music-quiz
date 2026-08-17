# Implementation status

## Plan and gates

- [x] Phase 1: foundation, fake adapter, config, health endpoint, docs, quality commands.
- [x] Phase 2: isolated domain state machine, queue, excerpts, scoring, boundary tests.
- [x] Phase 3: typed API service and in-memory local session boundary.
- [x] Phase 4: PKCE helper and catalog adapter boundary; live Spotify exchange remains manual/configured.
- [x] Phase 5: masked/revealed host UI and fake/narrow playback boundary; live SDK wiring remains manual hardening.
- [x] Phase 6: SQLite persistence, enhanced E2E tests, live playback checklist.

## Executed results

Executed 2026-08-04 in this workspace:

- `make format` — passed.
- `make lint` — passed (Ruff and ESLint).
- `make typecheck` — passed (mypy and TypeScript strict check).
- `make test` — passed (16 backend tests: 5 domain, 10 persistence, 1 service; 1 frontend test).
- `make build` — passed (Vite production build).
- `make verify` — passed (format, lint, typecheck, tests, build).

Executed 2026-08-05 for rate-limit hardening:

- `python3 -m py_compile scripts/batch-import-playlist.py` — passed.
- `.venv/bin/ruff check backend/src backend/tests` — passed.
- `.venv/bin/mypy backend/src` — passed.
- `.venv/bin/pytest backend/tests -q` — passed (16 tests).
- No live Spotify request was made; import behavior remains manually unverified.

Executed 2026-08-05 for OAuth redirect/session repair:

- `.venv/bin/pytest -q` — passed (19 backend tests).
- `.venv/bin/ruff check backend/src backend/tests` — passed.
- `.venv/bin/mypy backend/src` — passed.
- `npm run typecheck` — passed.
- `npm test -- --run` — passed (1 frontend test).
- `npm run build` — passed.
- Live Spotify OAuth/playback remains unverified without credentials.

Additional CI hardening:

- Added the missing frontend `format:check` script used by the Arch workflow.
- Normalized `frontend/src/styles-win95-desktop.css` so the format check passes.
- Confirmed the local `frontend/package-lock.json` contains only public npm registry package URLs.

Executed 2026-08-05 for release update checks:

- `npm run test -- --run update.test.ts` — passed (2 frontend tests).
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm run lint` — passed.
- `npm run format:check` — passed.
- Added a non-blocking startup check and manual `Update suchen` action using the public GitHub Releases API.
- The check only reports a newer platform asset and links to the release; it does not download or replace files automatically.

**Phase 6 additions:**
- SQLite persistence layer with migrations (`music_quiz/persistence/`)
- Repository protocol and SQLite implementation
- 10 new persistence tests (CRUD, state restoration, cascade delete)
- 3 new E2E test suites: game-flow.spec.ts, concealment.spec.ts, accessibility.spec.ts
- Accessibility audit with @axe-core/playwright
- Live playback checklist documentation (`docs/live-playback-checklist.md`)
- HTML accessibility fixes (lang attribute, proper DOCTYPE)

**Note on E2E tests:** E2E tests require backend server running separately. Run with:
```sh
# Terminal 1
.venv/bin/uvicorn music_quiz.main:app --reload --app-dir backend/src

# Terminal 2
npm --prefix frontend run e2e
```

## Known limitations

- Live Spotify OAuth and Web Playback SDK verification are manual. The production browser adapter is implemented, but SDK device lifecycle and real audio behavior are not live-verified. The backend catalog now fully follows playlist pagination and applies bounded 401 refresh, 429 `Retry-After`, and 5xx retries; real rate-limit behavior remains unverified.
- E2E tests assume backend is already running (not auto-started by Playwright).
- Some E2E tests may timeout if backend is not running or if network latency is high.

## OAuth session repair — 2026-08-10

- Added a mocked end-to-end OAuth lifecycle regression covering PKCE state persistence and one-time consume, the real `SpotifyAuthService.exchange_code()` with an HTTP token response mock, durable SQLite token persistence, session-cookie lookup, `/auth/status`, `/auth/token`, repository reload, replay rejection, and unusable-token failure.
- The callback now redirects with `auth_callback=success` only after persistence and creates an HttpOnly session. The frontend derives connected state exclusively from `/auth/status` and reports a visible recovery error otherwise.
- Normalized the database path once at startup, added safe structured auth diagnostics, removed unnecessary playlist-modify scopes, and made fake catalog/playback explicitly opt-in.
- Verified: `make format`, `make lint`, `make typecheck`, `make test`, `make build`, and `make verify` all passed. Backend: 22 tests; frontend: 5 tests.
- Not run: `npm --prefix frontend run e2e` because it requires separately running backend/frontend servers. Live Spotify OAuth and Web Playback SDK remain unverified without a real Premium account.

## Contradictory review verification — 2026-08-10

- Verified the local HEAD contains no `SpotifyWebCatalog` or `SpotifyWebPlayback`; those files exist only on the divergent remote branch `origin/fix/playback-stability-and-complexity` and were not deleted by the local OAuth commit.
- Confirmed and fixed OAuth state/session binding and pre-auth session invalidation. Successful login now rotates the session identifier; the old session cannot access `/auth/status` or `/auth/token`.
- `npm --prefix frontend run e2e` was executed against locally started servers: 21 tests ran, 2 passed and 19 failed. The failures are existing UI/test drift (the active entrypoint renders `App-win95-desktop`, while tests expect the older `App` strings such as `Create demo game` and `Guess the track`) plus existing accessibility violations.

## Playback adapter integration and E2E restoration — 2026-08-10

- Integrated the existing `SpotifyWebCatalog` and `SpotifyWebPlayback` adapters from `origin/fix/playback-stability-and-complexity` without replacing the current OAuth/session code.
- Real mode now requires an authenticated session; fake catalog/playback is selected only by `FAKE_SPOTIFY=true` / `VITE_FAKE_SPOTIFY=true`.
- Updated the Playwright suite to the Win95/Netscape entrypoint, added mocked callback-status coverage, and fixed the verified heading/contrast/landmark issues. The final suite is 24/24 passing in explicit fake mode.
- Verified: backend 23 tests, frontend 5 tests, typecheck, lint, format, build, and Playwright. Live Spotify OAuth, real playlist loading, Web Playback SDK device lifecycle, and audio playback remain unverified.

## Final verification and adapter hardening — 2026-08-10

- Real-mode startup was verified with the configured redirect URI (`http://127.0.0.1:8000/api/v1/auth/callback`) and development frontend origin. A real browser reached the official Spotify login page and created an HttpOnly pending application session cookie; no Spotify credentials were available for completing consent.
- Real-mode unauthenticated behavior was verified: `/api/v1/playlists` returns 401 and game creation without a playlist returns 400; no fake fallback occurs.
- The Win95 configuration screen now loads authenticated Spotify playlists and sends the selected `playlist_id` for real game creation; fake-mode controls remain deterministic.
- Added four HTTP-mock regression tests for full pagination, bounded 429/`Retry-After`, bounded 5xx backoff, and one-time 401 refresh retry. Backend total is now 27 tests.
- Live OAuth consent, real playlist loading, token refresh, Premium eligibility, SDK device readiness, and audio playback remain not verified.

## Playback error handling — 2026-08-10

- `not_ready` now invalidates the cached device/readiness and reports a recoverable sanitized error to the UI.
- `playback_error` now reports the stable message `Spotify playback failed.` without forwarding SDK payloads.
- Added frontend adapter tests for both events. Final automated frontend unit total is 6; live SDK event behavior remains unverified.
