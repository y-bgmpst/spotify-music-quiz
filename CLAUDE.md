# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Spotify Music Quiz is a local-first playlist guessing game. The host authenticates via Spotify OAuth, selects a playlist, configures teams and rounds, and plays non-repeating track excerpts while managing scoring. The MVP uses a fake Spotify adapter for automated testing; live playback requires Premium and manual verification.

## Architecture

**Backend (Python/FastAPI):**
- `music_quiz/domain/game.py` — pure domain logic: `Game`, `Track`, `Round`, `GameConfig`, state machine (`GameStatus`), scoring, queue building
- `music_quiz/spotify/` — adapter protocol with `fake.py` (deterministic catalog) and future HTTP implementation
- `music_quiz/persistence/` — repository protocol with SQLite implementation for durable game state
- `music_quiz/services.py` — `QuizService` orchestrates domain operations
- `music_quiz/main.py` — FastAPI routes, CORS, auth flow, game lifecycle endpoints

**Frontend (React/TypeScript/Vite):**
- `src/App.tsx` — single-component UI handling game state, timer, playback coordination
- `src/api/client.ts` — typed API wrapper
- `src/spotify/player.ts` — `FakePlayback` stub (Web Playback SDK integration pending)

**Key principles:**
- Backend is authoritative for state, queue, excerpt positions, scoring
- Domain logic is pure Python (no HTTP/Spotify/persistence imports)
- Frontend owns the Web Playback SDK instance and renders server state
- SQLite persistence stores game state durably (survives backend restart)
- Database at `.data/quiz.db` (configurable via `DATABASE_PATH` env var)

## Development Commands

Setup and install dependencies:
```sh
make setup
```

Run backend (from repo root):
```sh
.venv/bin/uvicorn music_quiz.main:app --reload --app-dir backend/src
```

Run frontend dev server (from repo root):
```sh
npm --prefix frontend run dev
```

Format code:
```sh
make format                              # both backend and frontend
.venv/bin/ruff format backend/src        # backend only
npm --prefix frontend run format         # frontend only
```

Lint:
```sh
make lint                                # both
.venv/bin/ruff check backend/src         # backend only
npm --prefix frontend run lint           # frontend only
```

Type checking:
```sh
make typecheck                           # both
.venv/bin/mypy backend/src               # backend only
npm --prefix frontend run typecheck      # frontend only
```

Run tests:
```sh
make test                                # both (backend unit + frontend unit)
.venv/bin/pytest backend/tests           # backend only (all)
.venv/bin/pytest backend/tests/test_domain.py  # specific test file
.venv/bin/pytest backend/tests -q        # quiet mode
npm --prefix frontend test -- --run      # frontend only (non-watch)
```

E2E tests (requires backend running):
```sh
# Terminal 1: Start backend
.venv/bin/uvicorn music_quiz.main:app --reload --app-dir backend/src

# Terminal 2: Run E2E tests
make e2e
npm --prefix frontend run e2e
```

Build frontend:
```sh
make build
npm --prefix frontend run build
```

Full verification (format, lint, typecheck, test, build):
```sh
make verify
```

## Domain Model

**Game lifecycle:**
`READY` → `PLAYING` → `PAUSED` ↔ `PLAYING` → `REVEALED` → (next round or `FINISHED`)

State transitions are enforced by `Game` methods: `start()`, `pause()`, `resume()`, `reveal()`, `next_round()`. Illegal transitions raise `DomainError`.

**Track normalization:**
`normalize_tracks()` deduplicates by URI, validates structure, applies explicit filtering, and rejects tracks too short for configured excerpt/guards.

**Queue building:**
`build_queue()` shuffles eligible tracks using an optional seed, caps to requested rounds, precomputes excerpt positions per round using deterministic per-round RNG.

**Excerpt positioning:**
- Intro mode: starts at 0ms
- Random mode: respects `intro_guard_seconds`, `outro_guard_seconds`, ensures excerpt fits before outro guard

**Scoring:**
Append-only `ScoreEvent` list with `reversed` flag. `add_score()` is idempotent by event ID (deduplication for retry safety). `reverse_score()` marks an event reversed and recalculates all participant totals.

## API Contract

All routes are under `/api/v1/`:

**Health/Auth:**
- `GET /health` → `{"status": "ok"}`
- `GET /auth/status` → `{"authenticated": bool}`
- `GET /auth/login` → redirects to Spotify OAuth
- `GET /auth/callback?code=...&state=...` → validates state, exchanges code (placeholder)

**Playlists:**
- `GET /playlists` → list of playlists from catalog
- `GET /playlists/{playlist_id}/analysis` → eligibility summary (total, eligible, duplicates)

**Game lifecycle:**
- `POST /games` (body: `ConfigInput`) → creates game, returns payload
- `GET /games/{game_id}` → current game state (concealed or revealed)
- `POST /games/{game_id}/round/start` → transition to PLAYING
- `POST /games/{game_id}/round/pause` → transition to PAUSED
- `POST /games/{game_id}/round/resume` → transition back to PLAYING
- `POST /games/{game_id}/round/reveal` → transition to REVEALED, includes answer
- `POST /games/{game_id}/round/next` → advance round or finish game

Mutations return `409` on `DomainError` (illegal transition), `404` on missing game, `400` on validation failure.

## Configuration

Environment variables (see `.env.example`):
- `SPOTIFY_CLIENT_ID` — OAuth app client ID
- `SPOTIFY_REDIRECT_URI` — registered callback (e.g., `http://127.0.0.1:8000/api/v1/auth/callback`)
- `FRONTEND_ORIGIN` — CORS allowed origin (default: `http://127.0.0.1:5173`)
- `DATABASE_PATH` — SQLite database location (default: `.data/quiz.db`)

The `.data/` directory is gitignored and stores persistent game state.

## Testing Philosophy

Automated tests use `FakeSpotifyCatalog` and require no Spotify credentials. Backend tests cover normalization, queue determinism, state transitions, scoring logic, and persistence (CRUD, state restoration, cascade delete). Frontend unit tests cover concealment, timer cleanup, reveal flow. E2E tests cover full game flow, concealment validation, and accessibility compliance.

Live Web Playback SDK integration (Premium required) is verified through a manual checklist documented in `docs/live-playback-checklist.md`.

## Code Conventions

**Backend:**
- Strict typing (`mypy --strict`)
- Ruff formatting (100 char line length)
- Domain errors raise `DomainError` (caught at API boundary)
- Use `dataclass(frozen=True)` for immutable value objects
- Domain logic stays pure (no IO/HTTP/Spotify imports in `domain/`)
- Repository pattern for persistence (protocol + SQLite implementation)
- Foreign key constraints enabled for referential integrity

**Frontend:**
- Strict TypeScript
- Prettier formatting
- ESLint with react-hooks plugin
- Timer cleanup in `useEffect` return
- Concealment logic prevents answer leakage before reveal
- Axe-core accessibility audits in E2E tests

## MVP Acceptance Criteria

See `MVP_SPECIFICATION.md` for full requirements. Key deliverables:
1. OAuth with PKCE completes
2. Playlist selection and pagination works
3. Game creation with configurable rounds/teams
4. Non-repeating shuffle with deterministic seed support
5. Excerpt playback at precomputed positions
6. Metadata concealment before reveal
7. Score add/reverse with idempotent event handling
8. State persistence across refresh (when implemented)
9. All automated checks pass without credentials
10. Manual live-playback checklist completed

## Known Implementation Status

Current: SQLite persistence, fake adapter, React UI prototype with timer/concealment, enhanced E2E test coverage.

Pending: Live Spotify HTTP adapter, Web Playback SDK integration, score management UI, proper error handling.

See `docs/implementation-status.md` and `docs/roadmap.md` for detailed tracking.
