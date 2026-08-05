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

- Live Spotify OAuth and Web Playback SDK verification are manual. The current browser adapter is deterministic fake playback for automated UI work; production SDK event wiring is documented in the live playback checklist but not yet implemented.
- E2E tests assume backend is already running (not auto-started by Playwright).
- Some E2E tests may timeout if backend is not running or if network latency is high.
