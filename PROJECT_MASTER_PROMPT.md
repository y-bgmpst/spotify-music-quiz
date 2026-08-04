# Project Master Prompt — Spotify Music Quiz

## 1. Mission

Build a private, browser-based Spotify music guessing game for small groups.

The application uses the authenticated host's Spotify playlists, selects eligible tracks randomly without repetition, plays a configurable excerpt through Spotify's official playback capabilities, hides identifying metadata during the guessing phase, reveals the answer on demand, and maintains a score for players or teams.

The first release is a local-first MVP for private use. It is not a commercial streaming product and must not download, extract, cache, transform, or redistribute Spotify audio.

---

## 2. Product principles

1. **Reliable before elaborate**  
   Playback, authentication, round progression, and recovery from Spotify errors matter more than visual effects.

2. **Local-first and private**  
   The application should run on a local machine and should not require a hosted backend for the MVP.

3. **Official Spotify interfaces only**  
   Use the Spotify Web API and Spotify Web Playback SDK. Do not use scraping, unofficial downloaders, browser automation, audio capture, or undocumented endpoints.

4. **Minimal authorization**  
   Request only the OAuth scopes required by implemented features.

5. **No hidden failure states**  
   Authentication, missing Premium eligibility, unavailable playback devices, rate limits, restricted tracks, and market restrictions must be surfaced clearly.

6. **Deterministic game state**  
   The server is authoritative for game configuration, selected tracks, rounds, players, teams, and scoring.

7. **Replaceable integrations**  
   Spotify-specific code must be isolated behind adapters so the quiz engine is testable without live Spotify access.

---

## 3. Current platform assumptions

Before implementation, verify all Spotify requirements against the current official Spotify Developer documentation.

Expected baseline as of July 2026:

- The Spotify Web Playback SDK requires an eligible Spotify Premium subscription.
- New applications begin in Development Mode.
- Development Mode supports up to five allowlisted authenticated users per app.
- A developer account can currently create up to 25 Client IDs; Development Mode quota accounting is shared per developer account.
- Authorization Code with PKCE is the preferred flow for browser clients where a client secret cannot be stored safely.
- Loopback HTTP redirect URIs are permitted only with explicit addresses such as `127.0.0.1`; `localhost` must not be used.
- Access tokens expire and must be refreshed or renewed correctly.
- Spotify rate-limit responses must respect `Retry-After`.
- Spotify audio must remain in its original form and must not be downloaded or cached.
- Commercial streaming integrations are outside the scope of this project.

If official documentation conflicts with this prompt, follow the current official documentation and record the deviation in `docs/assumptions.md`.

---

## 4. Target users

### Primary user

The host:

- owns the Spotify Developer application;
- has an eligible Spotify Premium account;
- selects a playlist;
- controls playback and round progression;
- creates players or teams;
- awards or corrects points;
- reveals answers.

### Secondary users

Local participants:

- see the quiz display;
- discuss or submit guesses;
- may use the same screen in the MVP;
- do not require individual Spotify accounts.

A multi-device buzzer or participant client is explicitly deferred until after the MVP.

---

## 5. Core game loop

1. Host opens the application.
2. Application checks configuration and Spotify authentication.
3. Host signs in through Spotify OAuth.
4. Application initializes a Spotify Web Playback SDK device.
5. Host selects a playlist.
6. Application retrieves all available playlist items with pagination.
7. Application filters unsupported or ineligible items.
8. Host configures the game.
9. Application creates a shuffled, non-repeating round queue.
10. Host starts a round.
11. Application chooses a safe excerpt start position.
12. Identifying metadata is hidden.
13. Spotify begins playback on the Web Playback SDK device.
14. Playback pauses automatically after the configured excerpt duration.
15. Host reveals title, artist, album, and cover.
16. Host awards points.
17. Application advances to the next unused track.
18. At game end, final standings are displayed.

---

## 6. MVP scope

### Included

- Spotify OAuth using Authorization Code with PKCE
- Spotify Premium/Web Playback eligibility check
- playlist listing
- playlist-item pagination
- filtering of unsupported playlist entries
- random track ordering without repetition
- configurable excerpt duration
- intro mode
- random excerpt mode
- safe excerpt-position calculation
- automatic pause after excerpt duration
- hidden metadata during playback
- answer reveal
- players and teams
- manual scoring
- score correction
- game reset
- session persistence
- clear error and recovery states
- responsive desktop-first browser UI
- automated unit and integration tests
- local development documentation
- optional Docker-based local startup

### Excluded from MVP

- public deployment
- commercial use
- more than five Spotify-authenticated users
- participant login
- mobile buzzer clients
- real-time multiplayer networking
- automatic speech recognition
- automatic free-text answer judging
- lyrics
- audio fingerprinting
- audio downloading or caching
- waveform processing
- playlist modification
- crossfade or audio effects
- native desktop/mobile applications
- global user accounts
- cloud database
- telemetry or analytics
- social sharing
- Apple Music, YouTube Music, or local-file playback

---

## 7. Recommended architecture

### Frontend

- React
- TypeScript
- Vite
- Spotify Web Playback SDK
- a small explicit state-management solution
- accessible semantic HTML
- responsive CSS without a heavy UI framework unless justified

Responsibilities:

- PKCE browser flow
- Spotify SDK initialization
- playback device lifecycle
- quiz controls
- timers displayed to the user
- masked and revealed answer states
- score controls
- clear recovery actions

### Backend

- Python 3.13 or the latest stable project-compatible Python release
- FastAPI
- Pydantic
- SQLAlchemy or SQLModel only if persistence complexity justifies it
- SQLite for local persistence
- structured logging
- pytest

Responsibilities:

- configuration validation
- Spotify API adapter
- token handling strategy
- playlist and track normalization
- game-state authority
- randomization
- non-repetition
- excerpt calculation
- score mutation
- API contracts
- persistence
- validation and error translation

### Key architecture rule

Do not split logic arbitrarily between frontend and backend.

The backend owns:

- game configuration;
- track queue;
- selected round;
- reveal state;
- players;
- teams;
- score;
- session persistence.

The frontend owns:

- Spotify Web Playback SDK instance;
- browser playback device;
- presentation;
- local UI interactions;
- rendering of backend-authoritative state.

Playback commands may be initiated through the browser SDK or supported Spotify Player endpoints, but the round state must remain synchronized with the backend.

---

## 8. Repository structure

Use a monorepo with an explicit, maintainable structure:

```text
spotify-music-quiz/
├── AGENTS.md
├── README.md
├── LICENSE
├── .editorconfig
├── .gitignore
├── .env.example
├── Makefile
├── docker-compose.yml
├── docs/
│   ├── architecture.md
│   ├── assumptions.md
│   ├── security.md
│   ├── spotify-setup.md
│   ├── testing.md
│   └── roadmap.md
├── backend/
│   ├── pyproject.toml
│   ├── src/
│   │   └── music_quiz/
│   │       ├── api/
│   │       ├── core/
│   │       ├── domain/
│   │       ├── services/
│   │       ├── spotify/
│   │       ├── persistence/
│   │       └── main.py
│   └── tests/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── src/
│   │   ├── api/
│   │   ├── auth/
│   │   ├── components/
│   │   ├── features/
│   │   ├── spotify/
│   │   ├── state/
│   │   └── main.tsx
│   └── tests/
└── scripts/
    ├── dev.*
    ├── test.*
    └── verify.*
```

Adapt this structure only when there is a concrete technical reason. Document deviations.

---

## 9. Domain model

At minimum, model these concepts explicitly:

### Game

- identifier
- status: setup, ready, playing, paused, revealed, finished
- playlist reference
- configuration
- participants or teams
- ordered round queue
- current round index
- created/updated timestamps

### Game configuration

- number of rounds
- excerpt duration
- excerpt mode
- minimum intro exclusion
- minimum outro exclusion
- include/exclude explicit tracks
- allow local/unavailable tracks
- points for correct title
- points for correct artist

### Track

Normalized internal representation:

- Spotify URI
- Spotify ID when present
- title
- artists
- album
- duration in milliseconds
- cover URL
- explicit flag
- available markets or availability state
- playable status
- source playlist
- stable deduplication key

### Round

- round number
- selected track key
- excerpt start
- excerpt duration
- state
- started timestamp
- paused timestamp
- revealed timestamp
- awarded score changes

### Participant/team

- identifier
- display name
- type
- score
- score-event history

### Score event

- identifier
- round
- participant/team
- delta
- reason
- timestamp
- reversible status

---

## 10. Track selection rules

The selection algorithm must:

- use a cryptographically unnecessary but high-quality pseudorandom generator;
- support an optional deterministic seed for tests;
- deduplicate tracks using Spotify URI or another stable key;
- shuffle once when creating the game queue;
- never repeat a track within a game;
- cap rounds at the count of eligible unique tracks;
- produce an actionable error when no eligible tracks remain;
- avoid repeatedly calling Spotify for each round after the playlist has been normalized.

Do not rely on Spotify's shuffle state for quiz randomization.

---

## 11. Excerpt calculation

### Intro mode

Start from zero or from a configured small offset.

### Random mode

Calculate a safe range:

```text
minimum_start <= excerpt_start <= duration - outro_guard - excerpt_duration
```

Requirements:

- never choose a negative position;
- never choose a position beyond track duration;
- exclude tracks too short for the selected settings or fall back explicitly;
- configure intro and outro guard intervals;
- use deterministic behavior in tests;
- display the selected mode, not the exact hidden position, during play.

The backend should calculate and persist the selected excerpt position before playback begins.

---

## 12. Spotify integration requirements

Implement Spotify behind interfaces/adapters.

Required capabilities:

- authorize user;
- renew access;
- retrieve current user profile when required;
- list accessible playlists;
- retrieve all playlist items with pagination;
- normalize track items;
- initialize and observe the Web Playback SDK device;
- transfer or target playback appropriately;
- start a Spotify URI at a selected position;
- pause;
- detect SDK readiness and account errors;
- handle restricted/unavailable items;
- handle 401, 403, 404, 429, and transient 5xx responses;
- respect `Retry-After`;
- avoid retry storms.

Do not log:

- access tokens;
- refresh tokens;
- authorization codes;
- PKCE verifier values;
- client secrets;
- full sensitive callback URLs.

---

## 13. Authentication and token strategy

Use Authorization Code with PKCE unless current official Spotify guidance requires another approach.

Security requirements:

- random PKCE verifier;
- SHA-256 challenge;
- random OAuth `state`;
- strict state validation;
- exact redirect URI matching;
- explicit `127.0.0.1`, never `localhost`;
- no client secret in browser code;
- tokens held in memory where practical;
- persistent refresh material only if required and protected appropriately;
- no token material in browser storage unless the design documents and mitigates the risk;
- logout clears local session and token state;
- expired-token recovery is automatic and visible only if reauthentication is required.

Choose one coherent token architecture and explain it in `docs/security.md`.

---

## 14. API design

Use versioned internal endpoints, for example:

```text
GET    /api/v1/health
GET    /api/v1/auth/status
POST   /api/v1/auth/logout
GET    /api/v1/playlists
GET    /api/v1/playlists/{playlist_id}/summary
POST   /api/v1/games
GET    /api/v1/games/{game_id}
POST   /api/v1/games/{game_id}/start
POST   /api/v1/games/{game_id}/rounds/start
POST   /api/v1/games/{game_id}/rounds/pause
POST   /api/v1/games/{game_id}/rounds/reveal
POST   /api/v1/games/{game_id}/scores
DELETE /api/v1/games/{game_id}/scores/{score_event_id}
POST   /api/v1/games/{game_id}/next
POST   /api/v1/games/{game_id}/reset
```

These are conceptual. Refine them to avoid redundant commands and invalid state transitions.

Requirements:

- typed request and response models;
- consistent error schema;
- validation at boundaries;
- no leaking raw Spotify errors to the UI;
- optimistic concurrency or another protection against duplicate mutations where needed;
- idempotency for operations likely to be retried accidentally.

---

## 15. State machine

Model legal transitions explicitly.

Example:

```text
SETUP
  -> READY
READY
  -> PLAYING
PLAYING
  -> PAUSED
  -> REVEALED
PAUSED
  -> PLAYING
  -> REVEALED
REVEALED
  -> READY
  -> FINISHED
FINISHED
  -> SETUP
```

Reject invalid transitions with a domain error and a user-readable message.

Do not represent the game as a loose collection of unrelated booleans.

---

## 16. User interface

Required screens:

1. Configuration check
2. Spotify login
3. Playlist selection
4. Game setup
5. Quiz host screen
6. Answer reveal
7. Final standings
8. Recoverable error screen

Quiz host screen must show:

- round number;
- play/pause state;
- remaining excerpt time;
- reveal button;
- next-round button;
- players/teams and scores;
- manual score controls;
- connection/device status.

During guessing, do not display:

- track title;
- artist;
- album;
- cover;
- Spotify URI;
- browser title or accessible labels that leak the answer.

Accessibility requirements:

- keyboard operability;
- visible focus;
- proper button labels;
- sufficient contrast;
- reduced-motion compatibility;
- no answer leaks through alt text, DOM text, notifications, logs, or page metadata.

---

## 17. Error handling

Create explicit user-facing recovery flows for:

- Spotify Premium unavailable;
- login denied;
- expired authorization;
- Web Playback SDK authentication error;
- account error;
- playback error;
- SDK device not ready;
- no active device;
- playlist empty;
- playlist inaccessible;
- no eligible tracks;
- track unavailable in market;
- track too short;
- rate limited;
- Spotify temporarily unavailable;
- backend disconnected;
- stale game state;
- duplicate score submission.

Every recoverable error should offer a specific action such as retry, reconnect player, reauthenticate, select another playlist, or return to setup.

---

## 18. Persistence

For the MVP, persist:

- game configuration;
- participant/team names;
- current game;
- round queue;
- round progress;
- score events.

Do not persist Spotify audio.

Avoid persisting Spotify tokens unless required by the chosen architecture. If persisted, document storage, encryption assumptions, lifecycle, and deletion.

SQLite is sufficient. Keep schema migrations manageable from the start.

---

## 19. Testing strategy

### Backend unit tests

- playlist normalization;
- deduplication;
- random queue generation;
- deterministic seed behavior;
- round limit handling;
- excerpt calculation;
- short-track handling;
- state transitions;
- score additions and reversals;
- error mapping;
- retry and rate-limit policy.

### Backend integration tests

- API lifecycle with mocked Spotify adapter;
- persistence;
- session restoration;
- invalid transitions;
- duplicate requests.

### Frontend tests

- masked metadata;
- reveal behavior;
- timer behavior;
- disconnected SDK state;
- login state;
- score controls;
- error recovery controls;
- accessibility checks.

### End-to-end tests

Use a mocked Spotify boundary for automated CI.

A small manual live-Spotify test checklist must cover:

- login;
- SDK device readiness;
- playlist loading;
- playback from selected position;
- automatic pause;
- reveal;
- next round;
- token renewal;
- rate-limit/error behavior where practical.

Tests must not depend on a real Spotify account in CI.

---

## 20. Quality gates

Before declaring the MVP complete:

- backend formatter passes;
- backend linter passes;
- backend type checker passes;
- backend tests pass;
- frontend formatter passes;
- frontend linter passes;
- TypeScript type check passes;
- frontend tests pass;
- production build passes;
- no secrets are committed;
- `.env.example` is complete;
- setup documentation is executable;
- manual live-playback checklist is documented;
- architecture and security documents reflect the implementation.

Suggested tools:

- Python: Ruff, mypy or pyright, pytest
- TypeScript: ESLint, Prettier, Vitest, Testing Library
- E2E: Playwright
- security/dependencies: Dependabot or Renovate, npm audit as advisory, pip-audit as advisory

Do not weaken tests or lint rules merely to obtain a green build.

---

## 21. Local development

Expected commands should be simple and documented, for example:

```bash
make setup
make dev
make test
make lint
make build
```

Provide platform-neutral instructions where practical, plus explicit PowerShell instructions for Windows where commands differ.

The repository must include:

- `.env.example`;
- Spotify Dashboard setup;
- exact loopback redirect URI;
- dependency installation;
- development startup;
- test commands;
- production build;
- troubleshooting.

Never place real credentials in examples.

---

## 22. Documentation deliverables

Required:

- `README.md`: purpose, capabilities, quick start
- `docs/architecture.md`: components, boundaries, data flow
- `docs/assumptions.md`: decisions and verified Spotify constraints
- `docs/security.md`: OAuth, token handling, threat model
- `docs/spotify-setup.md`: Developer Dashboard and redirect setup
- `docs/testing.md`: automated and manual tests
- `docs/roadmap.md`: deferred features
- `AGENTS.md`: repository-specific instructions for coding agents

---

## 23. Implementation phases

### Phase 0 — Verification and skeleton

- verify current Spotify documentation;
- document constraints;
- create repository structure;
- establish formatting, linting, typing, tests, and build;
- add mocked Spotify adapter.

### Phase 1 — Domain and backend

- implement domain model;
- state machine;
- randomization;
- excerpt selection;
- scoring;
- persistence;
- API;
- backend tests.

### Phase 2 — Spotify authentication and catalog

- implement PKCE;
- authentication state;
- playlist listing;
- pagination;
- track normalization;
- error handling.

### Phase 3 — Playback and host UI

- integrate Web Playback SDK;
- device lifecycle;
- playback at selected position;
- automatic pause;
- masked/revealed views;
- scoring UI.

### Phase 4 — Hardening

- reconnect and token-expiry flows;
- rate limits;
- unavailable tracks;
- stale state;
- accessibility;
- end-to-end mocked tests;
- manual live Spotify validation.

### Phase 5 — Release candidate

- complete documentation;
- security review;
- dependency review;
- clean install test;
- production build;
- release checklist.

---

## 24. Definition of done

The MVP is done only when a new developer can:

1. clone the repository;
2. follow the documented Spotify Dashboard setup;
3. configure environment variables;
4. start backend and frontend;
5. authenticate with an eligible Spotify Premium account;
6. select a playlist;
7. create players or teams;
8. complete a multi-round game without repeated tracks;
9. hear each configured excerpt;
10. reveal answers;
11. modify and reverse scores;
12. recover from a player reconnect;
13. run all automated quality gates successfully.

---

## 25. Agent execution rules

- Inspect before modifying.
- Prefer complete, coherent files over patch fragments in explanations.
- Make incremental commits when Git is available.
- Never claim a command passed unless it was executed.
- Never claim live Spotify playback was tested unless it was tested with valid credentials.
- Use mocks for CI.
- Do not silently change scope.
- Record assumptions.
- Stop and report only for a genuinely blocking requirement such as missing credentials needed for a live manual test.
- Continue all implementation that does not require those credentials.
