# MVP Specification — Spotify Music Quiz

## Status

Draft implementation baseline.

## Objective

Deliver a private, local-first web application that allows one Spotify Premium host to run a music guessing game based on one of their Spotify playlists.

## Success criteria

The MVP succeeds when the host can authenticate, select a playlist, configure a game, play non-repeating excerpts, conceal and reveal track metadata, manage team scores, and finish a complete game reliably.

---

## Functional requirements

### FR-001 — Configuration validation

On startup, the application must validate required configuration and show actionable errors for missing or invalid values.

Required configuration includes:

- Spotify Client ID
- registered redirect URI
- backend/frontend origin configuration
- session secret or equivalent server-side secret when required
- database path

The application must never require a Spotify Client Secret in browser code.

### FR-002 — Spotify authentication

The host must be able to authenticate through Spotify using Authorization Code with PKCE.

Acceptance criteria:

- random PKCE verifier and SHA-256 challenge;
- OAuth `state` generated and validated;
- callback rejects mismatched state;
- redirect URI uses explicit loopback IP during local development;
- login denial is handled;
- token expiration is recovered automatically when possible;
- logout clears application authentication state.

### FR-003 — Premium/playback eligibility

The application must detect and clearly report when the authenticated account cannot use the Web Playback SDK.

Acceptance criteria:

- game cannot start without a ready playback device;
- error state provides reauthentication or retry;
- no generic blank player screen.

### FR-004 — Playlist selection

The host must be able to view and select accessible playlists.

Each list item should include:

- playlist name;
- cover when available;
- owner;
- item count where available.

Search or filtering in the selection screen is optional but recommended.

### FR-005 — Playlist loading

The application must retrieve all playlist items using pagination and normalize them into an internal track representation.

It must handle:

- missing tracks;
- unavailable tracks;
- non-track items;
- duplicate tracks;
- local tracks;
- removed items;
- tracks without an ID but with another stable URI.

### FR-006 — Eligibility summary

Before game creation, display:

- total playlist items;
- eligible unique tracks;
- duplicates removed;
- unavailable/unsupported items;
- tracks too short for current excerpt settings.

The host must not begin a game with zero eligible tracks.

### FR-007 — Game configuration

The host must configure:

- individual players or teams;
- display names;
- round count;
- excerpt duration;
- excerpt mode: intro or random;
- optional explicit-track exclusion;
- title points;
- artist points.

Defaults:

- 10 rounds;
- 10-second excerpts;
- random mode;
- 1 point for title;
- 1 point for artist.

### FR-008 — Non-repeating randomization

At game creation, eligible unique tracks must be shuffled into a fixed round queue.

Acceptance criteria:

- no track repeats in one game;
- requested rounds are capped or rejected when greater than eligible tracks;
- test mode supports a deterministic random seed;
- queue survives a page refresh or backend restart when session persistence is enabled.

### FR-009 — Excerpt position

For intro mode, playback starts at zero or a configured intro offset.

For random mode:

- position must be within the valid track duration;
- intro and outro guard intervals must be observed;
- excerpt must fit before the outro guard;
- short tracks must be excluded or handled by a documented fallback;
- selected position must be persisted for the round.

Suggested defaults:

- intro guard: 15 seconds;
- outro guard: 20 seconds;
- excerpt duration: 10 seconds.

### FR-010 — Playback device

The browser must initialize a named Spotify Web Playback SDK device.

Acceptance criteria:

- device-ready state is visible;
- device ID is not exposed unnecessarily;
- authentication, account, initialization, and playback errors are handled;
- reconnect action is available;
- quiz cannot silently target another device.

### FR-011 — Round start

When the host starts a round:

- metadata is concealed;
- selected track is played at the precomputed position;
- visible countdown begins;
- playback pauses at the configured excerpt duration;
- repeated clicks do not create overlapping timers or duplicate state changes.

### FR-012 — Concealment

During the guessing phase, the UI and accessible DOM must not reveal:

- title;
- artist;
- album;
- cover;
- URI;
- identifying image alt text;
- identifying browser/page title.

Developer logs must not reveal the answer in normal operation.

### FR-013 — Pause and replay

The host must be able to pause an active excerpt.

A replay action may be included, but it must replay the same track and same excerpt position and must not alter the round queue.

### FR-014 — Reveal answer

The host must be able to reveal:

- title;
- all credited artists;
- album;
- cover;
- round number.

Reveal must automatically stop playback if playback is still active.

### FR-015 — Scoring

The host must be able to award points to a player or team.

Acceptance criteria:

- configurable title and artist point buttons;
- custom positive or negative adjustment;
- score event history;
- last or selected score event can be reversed;
- duplicate network submission does not award twice.

### FR-016 — Next round

After reveal, the host can advance to the next round.

Acceptance criteria:

- current track cannot be selected again;
- state returns to ready;
- next round does not begin automatically unless explicitly configured after MVP;
- final round advances to final standings.

### FR-017 — Final standings

At game completion, show:

- ranked participants/teams;
- total scores;
- tie handling;
- number of completed rounds;
- new-game and replay-configuration actions.

### FR-018 — Persistence

Persist locally:

- current game;
- configuration;
- participants/teams;
- round queue;
- current round;
- excerpt positions;
- score events.

Spotify audio must never be persisted.

### FR-019 — Reset

The host must be able to reset the current game with an explicit confirmation.

Reset must not delete application configuration or Spotify authorization unless logout is selected.

### FR-020 — Error recovery

The application must provide explicit recovery for:

- authentication expired;
- Premium unavailable;
- SDK device not ready;
- playlist inaccessible;
- no eligible tracks;
- current track unavailable;
- Spotify rate limit;
- transient Spotify failure;
- backend unavailable;
- stale game state.

---

## Non-functional requirements

### NFR-001 — Security

- no secrets committed;
- no Client Secret in frontend;
- no token logging;
- OAuth state validation;
- PKCE S256;
- strict redirect URI;
- secure defaults;
- least-privilege scopes;
- dependency audit documented.

### NFR-002 — Reliability

- legal game transitions modeled explicitly;
- timers cleaned up on navigation/unmount;
- duplicate command protection;
- Spotify API retries bounded;
- 429 respects `Retry-After`;
- transient 5xx retries use backoff and jitter;
- no retry for permanent 4xx errors.

### NFR-003 — Performance

For a normal private playlist, the UI should remain responsive while all pages are retrieved.

Playlist normalization and shuffle should happen once per game rather than once per round.

### NFR-004 — Accessibility

- keyboard-operable controls;
- visible focus;
- semantic elements;
- WCAG-conscious contrast;
- reduced-motion support;
- status messages exposed appropriately;
- no answer leakage to assistive technologies before reveal.

### NFR-005 — Maintainability

- strict TypeScript;
- typed Python;
- domain logic independent of HTTP and Spotify;
- Spotify adapter mockable;
- consistent error types;
- no oversized god components or services;
- architecture documented.

### NFR-006 — Testability

CI must run without Spotify credentials.

Live Spotify playback is validated through a separate manual test checklist.

### NFR-007 — Privacy

- no analytics;
- no third-party tracking;
- no unnecessary profile fields;
- no long-term storage of listening history beyond current local game data unless explicitly added later.

---

## Suggested OAuth scopes

Verify the exact current scope requirements before implementation.

Expected candidates:

```text
streaming
user-read-private
user-read-playback-state
user-modify-playback-state
playlist-read-private
playlist-read-collaborative
```

Do not request `user-read-email` unless a concrete implemented requirement needs it.

---

## Suggested internal API contract

### Health

```http
GET /api/v1/health
```

### Authentication

```http
GET  /api/v1/auth/status
POST /api/v1/auth/logout
```

### Spotify content

```http
GET /api/v1/playlists
GET /api/v1/playlists/{playlist_id}/analysis
```

### Game lifecycle

```http
POST /api/v1/games
GET  /api/v1/games/{game_id}
POST /api/v1/games/{game_id}/start
POST /api/v1/games/{game_id}/round/start
POST /api/v1/games/{game_id}/round/pause
POST /api/v1/games/{game_id}/round/reveal
POST /api/v1/games/{game_id}/round/next
POST /api/v1/games/{game_id}/finish
POST /api/v1/games/{game_id}/reset
```

### Scoring

```http
POST   /api/v1/games/{game_id}/score-events
DELETE /api/v1/games/{game_id}/score-events/{event_id}
```

The implementation may improve these routes, but must preserve explicit lifecycle validation and typed contracts.

---

## Required error schema

```json
{
  "error": {
    "code": "SPOTIFY_RATE_LIMITED",
    "message": "Spotify is temporarily rate limiting requests.",
    "retryable": true,
    "retry_after_seconds": 8,
    "details": {}
  }
}
```

Do not expose raw tokens, callback values, or unfiltered upstream response bodies.

---

## Data acceptance rules

A playlist item is eligible only when:

- it resolves to a playable track representation;
- it has a usable Spotify URI;
- duration supports the configured excerpt;
- it is not excluded by game settings;
- it is unique in the normalized queue.

Episodes and unsupported item types are excluded from the MVP.

---

## Definition of MVP completion

The MVP is accepted when all of the following are demonstrated:

1. Clean repository setup succeeds from documentation.
2. Spotify OAuth completes using the documented loopback redirect.
3. Web Playback SDK reaches a ready state.
4. A private or public accessible playlist can be selected.
5. Pagination retrieves the complete playlist.
6. Ineligible items are summarized.
7. A 10-round game can be created.
8. No track repeats.
9. Random excerpts start at valid positions.
10. Playback pauses automatically.
11. Answers remain concealed before reveal.
12. Answer reveal displays correct metadata.
13. Team scores can be added and reversed.
14. Refresh restores the current local game.
15. SDK reconnect can recover without rebuilding the game.
16. Automated tests pass without live Spotify credentials.
17. Formatter, linter, type checker, test suite, and production build pass.
18. No secrets appear in Git history or logs.
19. Manual live-Spotify checklist is completed and recorded.
20. Known limitations are documented.

---

## Post-MVP candidates

Prioritize only after the MVP is stable:

- phone-based buzzer clients;
- WebSocket game synchronization;
- multiple host displays;
- automatic answer normalization;
- optional multiple-choice mode;
- genre/year rounds;
- album-cover mode;
- configurable replay penalties;
- game history;
- playlist presets;
- local-file provider;
- Apple Music provider;
- installable PWA;
- native desktop packaging.
