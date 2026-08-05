# Spotify Music Quiz - Phase 6 Implementation Prompt

## Context

This is a local-first Spotify playlist guessing game. The MVP foundation is complete through Phase 5:

- ✅ Phase 1-4: Foundation, domain logic, fake adapter, API service, PKCE helpers
- ✅ Phase 5 (partial): Basic host UI with concealment/reveal, fake playback boundary
- ⏳ Phase 6 (next): SQLite persistence, enhanced E2E tests, live playback checklist

**Current state:**
- Backend: FastAPI with in-memory game storage, domain state machine, fake Spotify catalog
- Frontend: React UI with timer, concealment logic, basic playback coordination
- Tests: 6 backend unit tests, 1 frontend test, 1 Playwright smoke test
- All quality gates passing: `make verify` ✓

## Phase 6 Objectives

### 1. SQLite Persistence Layer

**Goal:** Replace in-memory repository with transactional SQLite for game state persistence and restart restoration.

**Requirements:**
- Create `music_quiz/persistence/` module with SQLite adapter
- Schema: `games` table (id, config JSON, queue JSON, status, current_index, created_at, updated_at)
- Schema: `participants` table (id, game_id FK, name, score)
- Schema: `score_events` table (id, game_id FK, participant_id FK, points, reason, reversed, created_at)
- Migrations using Alembic or simple numbered SQL files
- Transactional writes (atomic state updates)
- Repository protocol/interface that both in-memory and SQLite implement
- Configuration via `DATABASE_PATH` env var (default: `.data/quiz.db`)
- Backend startup validates/creates database
- Game retrieval after backend restart must restore full state

**Testing:**
- Unit tests for persistence layer (create, retrieve, update, list)
- Test that game survives service restart
- Test concurrent write safety (if applicable)
- Verify serialization/deserialization of domain objects

**Acceptance:**
- `make test` passes with persistence tests
- Backend can be stopped and restarted without losing game state
- No domain logic leaks into persistence layer (clean boundary)

### 2. Enhanced Playwright E2E Tests

**Goal:** Expand E2E coverage with mocked flows and accessibility audit.

**Requirements:**
- Test full game flow: create → start → pause → resume → reveal → next → finish
- Test concealment: verify answer metadata not in DOM before reveal
- Test scoring flow (when UI is added)
- Test timer countdown and auto-pause
- Test participant display and score updates
- Mock backend responses to avoid real Spotify dependency
- Add accessibility checks using Playwright's built-in tools
- Test keyboard navigation (tab order, enter/space on buttons)
- Test reduced-motion preferences
- Test screen reader announcements (aria-live regions)

**Files to modify/create:**
- `frontend/tests/e2e/game-flow.spec.ts` — full game lifecycle
- `frontend/tests/e2e/concealment.spec.ts` — answer hiding validation
- `frontend/tests/e2e/accessibility.spec.ts` — a11y audit
- Update `frontend/playwright.config.ts` if needed

**Acceptance:**
- At least 3 new E2E test files with meaningful scenarios
- `make e2e` passes all tests
- Accessibility violations are caught or documented

### 3. Live Playback Checklist Documentation

**Goal:** Document manual verification steps for Spotify Web Playback SDK with Premium account.

**Requirements:**
- Create `docs/live-playback-checklist.md`
- Cover: OAuth login flow, Premium detection, device initialization, playback start/pause/seek
- Cover: SDK error handling (auth failures, network issues, device not ready)
- Cover: Excerpt positioning accuracy (does random position work correctly?)
- Cover: Auto-pause after excerpt duration
- Cover: Multiple round playback without track repeats
- Include screenshots or expected outcomes
- Note prerequisites: Premium account, supported browser, test playlist

**Acceptance:**
- Checklist is comprehensive enough for a QA tester to follow
- All known manual verification steps are documented
- Limitations are explicitly stated (e.g., DRM requirements)

## Technical Guidelines

### SQLite Schema Design

```sql
-- Example structure (adapt as needed)
CREATE TABLE games (
    id TEXT PRIMARY KEY,
    config_json TEXT NOT NULL,
    queue_json TEXT NOT NULL,
    status TEXT NOT NULL,
    current_index INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE participants (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE score_events (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    participant_id TEXT NOT NULL REFERENCES participants(id),
    points INTEGER NOT NULL,
    reason TEXT NOT NULL,
    reversed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_participants_game ON participants(game_id);
CREATE INDEX idx_score_events_game ON score_events(game_id);
```

### Repository Pattern

```python
# music_quiz/persistence/repository.py
from typing import Protocol
from uuid import UUID
from music_quiz.domain.game import Game

class GameRepository(Protocol):
    def save(self, game: Game) -> None: ...
    def get(self, game_id: UUID) -> Game: ...
    def list(self) -> list[Game]: ...
    def delete(self, game_id: UUID) -> None: ...

# music_quiz/persistence/sqlite.py
class SQLiteGameRepository:
    def __init__(self, db_path: str): ...
    # Implement protocol methods
```

### E2E Test Pattern

```typescript
// frontend/tests/e2e/game-flow.spec.ts
import { test, expect } from '@playwright/test';

test('complete game flow', async ({ page }) => {
  await page.goto('/');
  
  // Create game
  await page.click('button:has-text("Create demo game")');
  await expect(page.locator('.round-bar')).toContainText('ROUND 1');
  
  // Start round
  await page.click('button:has-text("Start excerpt")');
  await expect(page.locator('.status')).toContainText('PLAYING');
  
  // ... continue flow
});
```

## Definition of Done

Phase 6 is complete when:

1. ✅ SQLite persistence implemented with migrations
2. ✅ Backend can restart without losing game state
3. ✅ At least 3 new E2E test scenarios
4. ✅ Accessibility audit passing or violations documented
5. ✅ Live playback checklist documented
6. ✅ `make verify` passes (all tests, lint, typecheck)
7. ✅ Documentation updated (`docs/architecture.md`, `docs/implementation-status.md`)
8. ✅ No regressions in existing functionality

## Out of Scope for Phase 6

- Live Spotify HTTP adapter (Phase 7)
- Web Playback SDK integration (manual verification only)
- Scoring UI (basic infrastructure only)
- Multi-player/team management UI
- OAuth token persistence
- Production deployment configuration

## Starting Point

Begin with:
1. Review current codebase structure (`CLAUDE.md` provides overview)
2. Run `make verify` to confirm clean baseline
3. Create persistence module structure
4. Implement SQLite repository with basic CRUD
5. Add persistence tests
6. Integrate into main.py (inject repository into service)
7. Add E2E tests
8. Document live playback checklist

## Questions to Resolve

Before starting implementation, consider:
- Should migrations be Alembic-based or simple SQL files?
- Where should `.data/` directory live (gitignored)?
- How to handle database schema versioning?
- Should repository support game filtering/search, or just basic CRUD?
- What level of concurrency safety is needed? (single host vs. future multi-instance)

## Success Metrics

- Game state survives backend restart
- E2E coverage increases from 1 to 4+ meaningful scenarios
- Accessibility score improves (measure with Lighthouse/axe)
- Manual playback checklist is clear enough for external QA
- No increase in `make verify` execution time beyond reasonable bounds
