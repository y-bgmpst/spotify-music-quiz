# Codex Implementation Prompt — Spotify Music Quiz

## Assignment

Implement the Spotify Music Quiz defined by:

- `PROJECT_MASTER_PROMPT.md`
- `MVP_SPECIFICATION.md`

Treat those files as authoritative product requirements. Work directly in the repository and produce a runnable, tested MVP.

## Operating mode

You are the primary implementation agent.

Do not respond with a hypothetical tutorial. Inspect the repository, create the project, edit files, execute commands, run tests, and resolve failures.

If the repository is empty, initialize it. If it already contains work, preserve valid existing decisions unless they conflict with the specification or create a material defect.

Do not wait for Spotify credentials to implement the system. Use a fake/mock Spotify adapter for automated development. Live playback verification may remain a documented manual step.

## Required first actions

1. Read all repository instructions and specification files.
2. Inspect current Git state and repository contents.
3. Verify current Spotify requirements using official documentation if web access is available.
4. Write or update:
   - `docs/assumptions.md`
   - `docs/architecture.md`
   - `docs/security.md`
5. Produce a short implementation plan grouped into independently testable phases.
6. Start implementation immediately.

## Technical baseline

Preferred stack:

### Backend

- Python 3.13
- FastAPI
- Pydantic
- SQLite
- SQLAlchemy 2.x or SQLModel only if justified
- pytest
- Ruff
- mypy or pyright

### Frontend

- React
- TypeScript with strict mode
- Vite
- Spotify Web Playback SDK
- Vitest
- Testing Library
- Playwright for mocked end-to-end flows
- ESLint
- Prettier

Use stable current versions. Pin or constrain dependencies sensibly.

## Critical design requirements

### Domain isolation

Keep game rules independent of FastAPI, React, Spotify SDK, and persistence.

Create explicit domain types for:

- game;
- game status;
- game configuration;
- track;
- round;
- participant/team;
- score event.

### State machine

Implement legal transitions explicitly. Reject invalid transitions through domain errors.

Do not use unrelated booleans such as `isPlaying`, `isRevealed`, and `isFinished` as the primary state model.

### Spotify boundary

Define a backend Spotify API port/interface and provide:

- production implementation;
- deterministic fake implementation;
- tests against the interface contract where practical.

Keep Web Playback SDK integration in a dedicated frontend module with a narrow application-facing API.

### Backend authority

The backend owns the game queue, round, reveal state, and score.

The frontend owns the browser playback SDK instance and presentation.

### Authentication

Implement Authorization Code with PKCE according to current Spotify requirements.

Never place a Client Secret in frontend code.

Use:

- PKCE S256;
- random state;
- strict callback validation;
- explicit loopback IP redirect;
- safe token lifecycle;
- redacted logs.

Document the chosen token architecture before or with implementation.

### Randomization

Create the queue once per game.

Requirements:

- deduplicate;
- deterministic seed injection for tests;
- no repetition;
- cap/reject excessive round count;
- persist queue.

### Excerpts

Implement a pure, unit-tested excerpt-position function.

It must handle:

- intro mode;
- random mode;
- guards;
- short tracks;
- invalid duration;
- deterministic RNG.

### Scoring

Use append-only score events with reversal rather than only mutating a total.

Derived score must remain correct after reversal and persistence reload.

### Error model

Create typed application errors and one consistent HTTP error envelope.

Translate Spotify errors; do not forward raw upstream bodies.

Implement bounded handling for:

- 401;
- 403;
- 404;
- 429 with `Retry-After`;
- transient 5xx;
- network timeout.

## Implementation phases

### Phase 1 — Foundation

Deliver:

- monorepo structure;
- backend/frontend bootstrap;
- configuration;
- quality tools;
- Makefile or equivalent commands;
- CI workflow;
- fake Spotify adapter;
- health endpoint;
- initial documentation.

Quality gate:

- backend and frontend test commands execute;
- lint and type-check execute;
- production frontend build executes.

### Phase 2 — Domain

Deliver:

- domain models;
- state machine;
- playlist normalization;
- deduplication;
- random queue;
- excerpt calculation;
- scoring and reversal;
- unit tests with boundary cases.

Do not proceed until domain tests are green.

### Phase 3 — Persistence and API

Deliver:

- SQLite schema and migration mechanism;
- repositories;
- game lifecycle service;
- typed API routes;
- idempotency/duplicate-mutation protection;
- API integration tests using fake Spotify data.

### Phase 4 — Spotify authentication and catalog

Deliver:

- PKCE login;
- auth status;
- logout;
- token lifecycle;
- playlist listing;
- pagination;
- playlist eligibility analysis;
- robust Spotify error translation;
- fake adapter parity tests.

### Phase 5 — Playback UI

Deliver:

- Web Playback SDK loader;
- SDK device state;
- masked quiz screen;
- start/pause/replay/reveal/next controls;
- automatic pause;
- stale-timer prevention;
- score controls;
- final standings;
- frontend component tests.

### Phase 6 — End-to-end and hardening

Deliver:

- mocked E2E happy path;
- mocked authentication failure;
- disconnected player recovery;
- no-eligible-track flow;
- rate-limit flow;
- accessibility checks;
- clean-install documentation;
- manual live-Spotify checklist.

## Required test cases

At minimum:

### Selection

- duplicates removed;
- two versions with distinct Spotify URIs remain distinct;
- empty playlist;
- unsupported items;
- requested rounds greater than eligible tracks;
- deterministic queue;
- no repeats.

### Excerpts

- normal random track;
- intro mode;
- exact-fit duration;
- too-short track;
- negative/invalid settings rejected;
- start never exceeds valid maximum;
- seeded selection is deterministic.

### State

- valid full lifecycle;
- start before ready rejected;
- reveal before play rejected or explicitly supported;
- next before reveal rejected;
- scoring in invalid phase handled according to documented rule;
- finished game cannot start another round.

### Score

- add;
- negative adjustment;
- reverse;
- reverse twice rejected/idempotent;
- persistence reload;
- duplicate submission protection.

### Spotify

- pagination;
- 401 refresh/retry once;
- 403 permanent failure;
- 429 respects retry delay abstraction;
- 5xx bounded retry;
- timeout;
- malformed upstream item;
- token fields never logged.

### Frontend

- metadata absent before reveal;
- metadata visible after reveal;
- timer cleanup;
- repeated start click;
- SDK not ready;
- SDK authentication error;
- score event and reversal;
- keyboard operation.

## Security review checklist

Before completion, verify:

- no real `.env`;
- no token in logs;
- no token in test snapshots;
- no Client Secret in frontend bundle;
- OAuth state cannot be bypassed;
- callback errors are safe;
- CORS restricted;
- cookies, if used, have suitable flags;
- session fixation mitigated;
- CSP documented or configured;
- external cover images handled without leaking answer before reveal;
- answer metadata not present in concealed DOM;
- database contains no audio;
- dependency vulnerabilities reviewed.

## Documentation requirements

Write complete, executable documentation. Include Windows PowerShell commands where materially different from POSIX commands.

`docs/spotify-setup.md` must explain:

- creating the Spotify application;
- selecting Web API and Web Playback SDK where applicable;
- adding the exact redirect URI;
- why `localhost` is not used;
- Development Mode allowlisting;
- required OAuth scopes;
- environment variables;
- Premium requirement;
- common SDK errors.

## Completion report

At the end, report:

1. implemented features;
2. architecture decisions;
3. exact commands executed;
4. test/lint/type/build results;
5. files added or materially changed;
6. unresolved limitations;
7. manual Spotify steps still required;
8. recommended next milestone.

Never state that live Spotify playback works unless it was actually tested with an eligible account.
