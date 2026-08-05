# Claude Review and Hardening Prompt — Spotify Music Quiz

## Role

Act as an independent principal software engineer, application-security reviewer, and adversarial QA reviewer.

Review the implementation against:

- `PROJECT_MASTER_PROMPT.md`
- `MVP_SPECIFICATION.md`

Do not assume the primary implementation agent made correct decisions. Verify behavior from code, tests, configuration, and executed commands.

Your task is to identify and, when authorized to edit, correct defects that could cause:

- OAuth compromise;
- token leakage;
- answer leakage;
- invalid game state;
- repeated tracks;
- broken playback;
- timer races;
- duplicate scoring;
- unrecoverable Spotify errors;
- weak tests;
- misleading documentation;
- unmaintainable architecture.

## Review method

1. Read all requirements and repository instructions.
2. Inspect Git state and project structure.
3. Map requirements to implementation.
4. Run the documented quality commands.
5. Run focused tests around high-risk components.
6. Inspect code paths manually.
7. Produce findings by severity.
8. When working in edit mode, fix critical and high findings, add regression tests, and rerun all gates.
9. Do not rewrite the project merely to match personal preferences.

## Severity model

### Critical

A defect that can expose credentials/tokens, allow OAuth takeover, violate Spotify audio restrictions, or make the core application fundamentally unsafe.

### High

A defect that can produce wrong game behavior, leak the answer, corrupt scoring/state, cause repeated tracks, or make normal Spotify failures unrecoverable.

### Medium

A meaningful reliability, maintainability, performance, accessibility, or test weakness.

### Low

A minor consistency, documentation, or developer-experience issue.

Do not inflate severity.

## Required review areas

### 1. Requirements traceability

Create a compact matrix for every MVP functional requirement:

- implemented;
- partially implemented;
- missing;
- contradicted;
- not verifiable.

Cite exact files and symbols.

### 2. OAuth and authentication

Verify:

- Authorization Code with PKCE;
- S256 challenge;
- verifier entropy;
- OAuth state entropy;
- state stored and validated correctly;
- one-time callback semantics;
- exact redirect URI;
- no `localhost`;
- no Client Secret in browser;
- token expiry path;
- refresh/reauthorization behavior;
- logout invalidation;
- callback error handling;
- CSRF/session fixation risks;
- cookie flags where applicable;
- no sensitive query strings logged.

Try to identify practical attack paths, not theoretical checklists only.

### 3. Token storage and logging

Search the repository for:

- `access_token`;
- `refresh_token`;
- authorization codes;
- PKCE verifier;
- Client Secret;
- debug logging;
- exception serialization;
- HTTP request/response dumps;
- browser storage.

Verify that tests, snapshots, logs, and telemetry cannot retain credentials.

### 4. Spotify platform compliance

Verify from official current Spotify documentation:

- Premium requirement;
- allowed authentication flow;
- redirect URI rules;
- Development Mode limits;
- required scopes;
- playback restrictions;
- rate-limit behavior;
- prohibition on audio download/cache/transformation;
- commercial-use limitations relevant to the project.

Flag stale claims in documentation.

### 5. Domain architecture

Verify that:

- game rules are not embedded in React components or HTTP handlers;
- Spotify integration is replaceable/mockable;
- legal game states are explicit;
- state transitions are validated;
- persistence does not bypass invariants;
- domain code is deterministic under injected RNG/time;
- error types are coherent.

### 6. Randomization and deduplication

Test and inspect:

- duplicate playlist entries;
- same title by different artists;
- same track in multiple playlist positions;
- relinked or unavailable tracks;
- missing ID with URI;
- deterministic seed;
- queue persistence;
- game restoration;
- round count boundaries;
- no repetition under every valid path, including replay and refresh.

Look for accidental re-shuffling per request.

### 7. Excerpt calculation

Review all boundary conditions:

- track shorter than excerpt;
- track exactly equal to excerpt plus guards;
- invalid negative settings;
- random upper bound inclusivity;
- integer rounding;
- millisecond/second confusion;
- overflow/untrusted duration;
- persisted start position;
- replay uses identical position;
- outro guard honored.

Use property-based testing if appropriate.

### 8. Playback lifecycle

Inspect frontend SDK integration for:

- script loading races;
- duplicate player instances;
- stale access-token callbacks;
- missing cleanup;
- event listener leaks;
- page refresh;
- device-ready/device-not-ready transitions;
- automatic pause races;
- user pause versus timer pause;
- repeated start clicks;
- reveal while playing;
- next round while timer active;
- React Strict Mode double effects;
- browser autoplay restrictions;
- transfer-to-device failure;
- playback command failure.

Add regression tests for identified races.

### 9. Answer concealment

This is a high-risk product requirement.

Verify before reveal that identifying information is absent from:

- visible text;
- hidden DOM;
- ARIA labels;
- image alt text;
- image URLs where directly exposed in inspectable UI state;
- page title;
- toast messages;
- network-derived debug panels;
- console logs;
- Redux/dev state exposed to normal users;
- browser media session metadata;
- notifications.

A visually hidden answer still counts as leaked.

Recommend a design where the frontend does not receive full answer metadata until reveal, if practical. Evaluate this tradeoff explicitly.

### 10. Scoring integrity

Verify:

- append-only events;
- derived totals;
- reversal;
- double reversal;
- duplicate request handling;
- concurrent button clicks;
- refresh during mutation;
- negative points;
- integer validation;
- attribution to round and participant;
- audit history;
- final ranking and ties.

### 11. API design

Review:

- typed boundaries;
- consistent error envelope;
- status codes;
- idempotency;
- authorization on every game route;
- object ownership;
- predictable route semantics;
- no raw Spotify errors;
- no stack traces in production;
- request-size and input limits;
- CORS.

### 12. Persistence

Verify:

- migrations;
- transaction boundaries;
- restoration;
- corrupted/incomplete session handling;
- queue ordering;
- score-event integrity;
- reset semantics;
- token/audio data policy;
- SQLite concurrency assumptions;
- accidental cascade deletion.

### 13. Retry behavior

Verify:

- 401 refresh and one controlled retry;
- 403 not retried blindly;
- 404 handling;
- 429 respects `Retry-After`;
- 5xx bounded exponential backoff with jitter;
- timeout bounds;
- cancellation;
- no retry storms;
- UI receives actionable state.

Mock time rather than creating slow tests.

### 14. Frontend quality

Review:

- strict TypeScript effectiveness;
- runtime validation of backend responses where justified;
- component boundaries;
- state ownership;
- stale closures;
- effect dependencies;
- cleanup;
- loading/error/empty states;
- responsive behavior;
- keyboard control;
- focus management;
- reduced motion;
- color contrast.

### 15. Tests

Do not count tests merely by number.

Assess:

- meaningful assertions;
- branch and boundary coverage;
- over-mocking;
- false-positive mocks;
- deterministic behavior;
- regression value;
- tests for error paths;
- tests for concurrency/races;
- live Spotify isolation;
- CI reproducibility.

Mutation testing is optional but may be used for critical domain modules.

### 16. Build and operations

Verify:

- clean install;
- pinned/controlled dependencies;
- `.env.example`;
- no secret files;
- production build;
- Docker configuration if present;
- health check;
- graceful shutdown;
- log redaction;
- Windows PowerShell instructions;
- documented exact commands.

## Required execution

Run, or explain why unavailable:

- backend formatter check;
- backend lint;
- backend type check;
- backend tests;
- frontend formatter check;
- frontend lint;
- TypeScript check;
- frontend tests;
- production build;
- mocked E2E tests;
- dependency audit;
- secret scan;
- Git diff/status.

Never report a passing check without executing it.

## Required output

Create `REVIEW_REPORT.md` with:

### Executive conclusion

- release recommendation: approve, approve with conditions, or reject;
- concise reason;
- confidence level.

### Findings

For each finding:

- ID;
- severity;
- title;
- affected requirement;
- evidence with file and symbol/line;
- impact;
- reproducible scenario;
- recommended fix;
- regression test.

### Requirements matrix

Map every functional and non-functional MVP requirement.

### Quality-gate results

Show exact commands and results.

### Spotify compliance verification

List current official documentation checked and any implementation/doc mismatch.

### Residual risk

State what cannot be proven without a live Spotify Premium account and browser playback.

## Edit-mode requirements

When authorized to fix findings:

- prioritize critical, then high;
- make minimal coherent changes;
- add tests before or with fixes;
- do not weaken validations;
- rerun all relevant gates;
- update `REVIEW_REPORT.md`;
- provide a final diff summary.

Do not claim the application is production-ready merely because automated tests pass. Live Web Playback SDK behavior requires a documented manual test.
