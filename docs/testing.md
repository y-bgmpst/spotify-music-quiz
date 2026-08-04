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

The backend tests cover queue determinism, normalization, excerpt boundaries, legal state transitions, scoring, and fake adapter pagination. The persistence tests cover SQLite CRUD operations, state restoration, and cascade deletion. Frontend tests cover concealment, reveal, repeated starts, and timer cleanup. Live Web Playback remains manual because it requires a Premium account and browser DRM support.

## Running E2E Tests

E2E tests require both backend and frontend servers running:

```sh
# Terminal 1: Start backend
.venv/bin/uvicorn music_quiz.main:app --reload --app-dir backend/src

# Terminal 2: Run E2E tests
npm --prefix frontend run e2e
```

The E2E test suite includes:
- Complete game flow (create, play, pause, resume, reveal, next round, finish)
- Answer concealment validation (metadata not leaked before reveal)
- Accessibility audits (WCAG compliance, keyboard navigation, screen reader support)

