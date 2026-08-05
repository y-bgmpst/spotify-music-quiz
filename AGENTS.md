# AGENTS.md — Spotify Music Quiz

## Authority

Read these files before modifying the project:

1. `PROJECT_MASTER_PROMPT.md`
2. `MVP_SPECIFICATION.md`
3. `CODEX_MASTER_BOOTSTRAP_PROMPT.md`
4. `CODEX_IMPLEMENTATION_PROMPT.md`
5. `CLAUDE_REVIEW_PROMPT.md`

`PROJECT_MASTER_PROMPT.md` and `MVP_SPECIFICATION.md` define product scope and acceptance criteria.

## Core rules

- Work directly in the repository; do not return hypothetical code only.
- Inspect before modifying and preserve unrelated user work.
- Keep domain rules independent of HTTP, React, Spotify, and persistence.
- Keep Spotify integrations behind replaceable adapters.
- The backend owns game state, queue, reveal state, and scoring.
- The frontend owns the Web Playback SDK instance and presentation.
- Use explicit state transitions, deterministic RNG injection, and append-only score events.
- Never download, cache, capture, transform, or redistribute Spotify audio.
- Never expose answer metadata before reveal, including hidden DOM, ARIA, logs, page metadata, or media-session metadata.
- Never put a Spotify Client Secret in frontend code.
- Never commit credentials or log tokens, authorization codes, OAuth state, or PKCE verifiers.
- CI and automated tests must run without Spotify credentials.
- Never claim a command or live playback test passed unless it was executed.
- Prefer complete coherent files over unexplained patch fragments.

## Required gates

Maintain repository-level commands for setup, format, lint, type checking, tests, E2E, build, and full verification. Keep `docs/implementation-status.md` updated with exact command results and unresolved limitations.
