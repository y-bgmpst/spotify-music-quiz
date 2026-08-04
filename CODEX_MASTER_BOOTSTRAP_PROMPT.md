# Codex Master Bootstrap Prompt — Spotify Music Quiz

## Role and execution mandate

You are the primary implementation agent for the Spotify Music Quiz project. Work directly in the currently opened repository.

Do not merely explain how the application could be built. Inspect the workspace, create and edit files, execute commands, run quality gates, diagnose failures, and leave the repository in the best verifiable state possible.

The repository may be empty. If it is empty, initialize the complete project. If it already contains work, inspect and preserve valid decisions unless they conflict with the authoritative requirements or create a material defect.

Do not stop because Spotify credentials are absent. All automated development and CI must use a deterministic fake Spotify adapter. Real credentials are required only for the final documented manual playback check.

## Authoritative inputs

Read these files before making implementation decisions, in this precedence order:

1. `PROJECT_MASTER_PROMPT.md` — product mission, architecture, scope, and engineering principles.
2. `MVP_SPECIFICATION.md` — binding functional and non-functional acceptance criteria.
3. `CODEX_IMPLEMENTATION_PROMPT.md` — detailed implementation phases and required tests.
4. `CLAUDE_REVIEW_PROMPT.md` — anticipated independent review criteria; design so the implementation can survive this review.
5. `CHATGPT_PROJECT_INSTRUCTIONS.md` — coordination and workflow context.

When files are missing but their contents are supplied in the surrounding Codex task/context, create them verbatim at repository root before implementation. Do not silently weaken, summarize, or replace their requirements.

If current official Spotify documentation conflicts with a project assumption, follow the official documentation and record the exact deviation, date checked, and source in `docs/assumptions.md`.

## Product boundary

Build a private, local-first browser application for one Spotify Premium host to run a music guessing game from an accessible Spotify playlist.

The MVP includes:

- Spotify Authorization Code with PKCE;
- playlist discovery and complete pagination;
- playlist eligibility analysis;
- fixed non-repeating randomized round queue;
- intro and random excerpt modes;
- browser playback through the official Spotify Web Playback SDK;
- strict answer concealment before reveal;
- participants or teams;
- append-only score events and reversal;
- local persistence and restoration;
- explicit error recovery;
- automated tests without Spotify credentials.

The MVP excludes:

- audio downloading, caching, recording, transformation, or redistribution;
- unofficial Spotify endpoints or scraping;
- public/multi-tenant deployment;
- participant accounts;
- phone buzzer clients;
- WebSocket multiplayer;
- Apple Music, YouTube Music, or local-file providers;
- analytics and tracking;
- automatic answer recognition.

Do not expand scope until the MVP quality gates and definition of done are satisfied.

## Technical baseline

Use a monorepo unless a concrete, documented reason requires a deviation.

### Backend

- Python 3.13, or the latest installed compatible Python if 3.13 is unavailable;
- FastAPI;
- Pydantic;
- SQLAlchemy 2.x with SQLite and a real migration mechanism;
- pytest;
- Ruff;
- mypy or pyright;
- structured, redacted logging.

### Frontend

- React;
- TypeScript with strict mode;
- Vite;
- Spotify Web Playback SDK behind a narrow adapter;
- Vitest;
- Testing Library;
- Playwright for mocked E2E flows;
- ESLint;
- Prettier.

Prefer stable current dependency versions and constrain them sensibly. Record meaningful version assumptions.

## Mandatory architecture

### Domain isolation

Keep game rules independent of FastAPI, React, Spotify, and persistence. Create explicit domain types and services for:

- game and game configuration;
- legal game status/state transitions;
- normalized track;
- round;
- participant/team;
- append-only score event and reversal;
- queue generation;
- excerpt-position calculation.

Use explicit legal state transitions. Do not model the primary game state as unrelated booleans.

### Authority split

The backend is authoritative for:

- game configuration;
- normalized eligible tracks;
- fixed queue and current round;
- excerpt start position;
- reveal state;
- participants and teams;
- score events and totals;
- persistence and restoration.

The frontend owns:

- the browser Spotify Web Playback SDK instance;
- device lifecycle and playback commands;
- presentation and local interaction state;
- displayed countdown, synchronized with backend-authoritative round state.

### Spotify boundary

Define a backend Spotify port/interface and implement:

- a production Web API adapter;
- a deterministic fake adapter;
- error translation and bounded retry behavior;
- contract-focused tests where practical.

Keep the Web Playback SDK in a dedicated frontend module with a narrow application-facing API. Prevent duplicate player instances, stale timers, event-listener leaks, and React Strict Mode double-effect bugs.

### Authentication and token architecture

Use Authorization Code with PKCE according to current official Spotify requirements.

Required properties:

- PKCE S256;
- high-entropy verifier and OAuth state;
- one-time, strict state validation;
- exact redirect URI using an explicit loopback IP such as `127.0.0.1`, never `localhost` when current Spotify policy requires that distinction;
- no Client Secret in frontend code or bundles;
- no token, authorization code, state, or verifier logging;
- safe expiration/refresh or reauthorization behavior;
- logout invalidation;
- restricted CORS;
- suitable cookie flags if cookies are used;
- session fixation mitigation.

Choose one coherent token architecture before implementing authentication and document it in `docs/security.md`. Do not mix incompatible browser-token and server-session strategies.

## Repository initialization

Create at least the following structure, adapting only with a documented reason:

```text
spotify-music-quiz/
├── AGENTS.md
├── README.md
├── LICENSE
├── .editorconfig
├── .gitignore
├── .env.example
├── Makefile
├── docker-compose.yml              # optional but supported if retained
├── PROJECT_MASTER_PROMPT.md
├── MVP_SPECIFICATION.md
├── CODEX_IMPLEMENTATION_PROMPT.md
├── CLAUDE_REVIEW_PROMPT.md
├── CHATGPT_PROJECT_INSTRUCTIONS.md
├── CODEX_MASTER_BOOTSTRAP_PROMPT.md
├── docs/
│   ├── architecture.md
│   ├── assumptions.md
│   ├── security.md
│   ├── spotify-setup.md
│   ├── testing.md
│   ├── roadmap.md
│   └── implementation-status.md
├── backend/
│   ├── pyproject.toml
│   ├── src/music_quiz/
│   │   ├── api/
│   │   ├── core/
│   │   ├── domain/
│   │   ├── services/
│   │   ├── spotify/
│   │   ├── persistence/
│   │   └── main.py
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
```

Create `AGENTS.md` with repository-specific instructions for future coding agents, including commands, architecture boundaries, security rules, and the requirement never to claim unexecuted tests.

## Required initial workflow

Perform these steps in order:

1. Inspect repository contents, instructions, available runtimes, package managers, and Git status.
2. Read every authoritative input file completely.
3. Verify current Spotify requirements using only official Spotify documentation when internet access is available.
4. Create or update:
   - `docs/assumptions.md`;
   - `docs/architecture.md`;
   - `docs/security.md`;
   - `docs/implementation-status.md`.
5. Write a concise phase plan in `docs/implementation-status.md`, including acceptance gates.
6. Initialize the project skeleton and quality tooling.
7. Begin implementation immediately; do not wait for approval between phases.

## Implementation phases and hard gates

### Phase 1 — Foundation

Deliver:

- monorepo skeleton;
- backend and frontend bootstrap;
- configuration validation;
- fake Spotify adapter;
- health endpoint;
- quality tooling;
- CI workflow;
- initial documentation;
- executable POSIX and PowerShell setup commands.

Gate:

- backend tests execute;
- backend lint and type check execute;
- frontend tests execute;
- frontend lint and type check execute;
- production frontend build executes.

### Phase 2 — Domain

Deliver:

- explicit domain models;
- legal state machine;
- playlist normalization and deduplication;
- deterministic fixed queue generation;
- pure excerpt calculation;
- append-only scoring and reversal;
- exhaustive boundary-focused unit tests.

Do not proceed until domain tests are green.

### Phase 3 — Persistence and API

Deliver:

- SQLite schema and migrations;
- repositories that preserve domain invariants;
- game lifecycle service;
- typed versioned API routes;
- consistent error envelope;
- duplicate mutation/idempotency protection;
- API integration tests using fake Spotify data;
- restoration after process restart.

### Phase 4 — Spotify authentication and catalog

Deliver:

- PKCE login/callback flow;
- auth status and logout;
- safe token lifecycle;
- playlist listing;
- full pagination;
- eligibility analysis;
- translated Spotify errors;
- bounded 401/403/404/429/5xx/timeout handling;
- tests using mocked HTTP/time abstractions.

### Phase 5 — Playback host UI

Deliver:

- SDK loader and single player lifecycle;
- visible device readiness;
- explicit reconnect flow;
- masked quiz state;
- start, pause, replay, reveal, and next controls;
- automatic pause with stale-timer protection;
- score controls and reversal;
- final standings;
- keyboard and accessibility support;
- frontend tests for races and answer concealment.

Before reveal, identifying metadata must not exist in visible text, hidden DOM, ARIA labels, image attributes, page title, logs, browser media metadata, or ordinary frontend state exposed to the user. Prefer not sending answer metadata to the frontend until reveal.

### Phase 6 — End-to-end and hardening

Deliver:

- mocked E2E happy path;
- authentication failure flow;
- SDK-not-ready/disconnected recovery;
- no-eligible-track flow;
- rate-limit flow;
- stale-state recovery;
- accessibility checks;
- clean-install documentation;
- manual live-Spotify checklist;
- dependency and secret scans.

## Required quality commands

Provide stable repository-level commands, preferably:

```text
make setup
make format
make lint
make typecheck
make test
make e2e
make build
make verify
```

Where Windows differs materially, document exact PowerShell equivalents.

Execute every available quality gate. Never report a command as passing unless it was actually executed in this workspace. If a tool cannot run, record the exact reason and continue with all other work.

Do not disable strict checks merely to obtain a green result. Fix root causes or document a narrowly justified exception.

## Required tests

Implement all tests listed in `CODEX_IMPLEMENTATION_PROMPT.md` and `MVP_SPECIFICATION.md`, including at minimum:

- duplicate and malformed playlist items;
- deterministic queues and no repetition;
- excerpt boundaries and short tracks;
- every legal and important illegal state transition;
- score adjustment, reversal, duplicate submission, and reload;
- Spotify pagination and bounded error/retry policies;
- token/log redaction;
- frontend concealment before reveal;
- timer cleanup and repeated clicks;
- SDK readiness/authentication errors;
- keyboard operation;
- mocked full-game E2E flow.

Use fake time instead of slow sleeps. Use deterministic RNG injection. CI must never need real Spotify credentials.

## Configuration and Spotify setup

Create a complete `.env.example` containing placeholders only. Do not generate or commit real credentials.

Document in `docs/spotify-setup.md`:

- how to create/configure the Spotify application;
- which APIs/SDKs are used;
- the exact redirect URI chosen by the implementation;
- why an explicit loopback IP is used;
- Development Mode user allowlisting and current limitations;
- required OAuth scopes and why each is needed;
- Premium/Web Playback eligibility;
- local environment variables;
- common callback and SDK errors;
- manual live test procedure.

Do not request `user-read-email` unless an implemented feature concretely requires it.

## Security prohibitions

Never:

- put a Spotify Client Secret in frontend code;
- commit a real `.env` file;
- log access tokens, refresh tokens, authorization codes, OAuth state, PKCE verifier, sensitive callback URLs, or raw upstream bodies;
- expose answer metadata before reveal;
- persist Spotify audio;
- use unofficial playback/download mechanisms;
- blindly retry permanent 4xx failures;
- claim live Spotify playback works without a real completed test.

## Git behavior

If Git is available:

- inspect status before edits;
- do not destroy unrelated user work;
- make small coherent commits after passing phase gates when permitted;
- use descriptive commit messages;
- leave a clean or clearly explained working tree;
- include final `git status` and diff summary in the completion report.

Do not force-push, rewrite existing history, or delete user branches.

## Progress and status recording

Keep `docs/implementation-status.md` current. After each phase, record:

- completed items;
- commands executed and results;
- known failures;
- assumptions;
- next phase;
- whether live Spotify credentials are still required for any remaining check.

This file is the durable handoff if execution is interrupted.

## Completion report

At the end of the Codex run, provide a factual report containing:

1. implemented features;
2. architecture and token-strategy decisions;
3. exact commands executed;
4. formatter/lint/type/test/E2E/build results;
5. files added or materially changed;
6. security checks performed;
7. unresolved defects and limitations;
8. manual Spotify steps still required;
9. Git status and commit summary;
10. recommended next milestone;
11. explicit statement that live playback is unverified unless it was actually tested.

Do not call the project production-ready solely because automated checks pass.

## Start now

Begin by inspecting the repository and reading all authoritative files. Then create/update the documentation and implementation plan and proceed directly through the phases. Ask a question only for a genuinely blocking ambiguity that cannot be resolved from the requirements, repository, official documentation, or a safe documented assumption.
