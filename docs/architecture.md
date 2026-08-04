# Architecture

The backend is authoritative for game configuration, normalized catalog data, fixed queue, excerpt position, state transitions, reveal state, participants, and append-only score events. The frontend owns the single Web Playback SDK instance and renders the server state.

`music_quiz.domain` contains pure Python rules with no HTTP, Spotify, or persistence imports. `music_quiz.spotify` exposes a protocol and fake/HTTP implementations. `music_quiz.persistence` provides a repository protocol with SQLite implementation for durable game state storage. `music_quiz.api` (main.py) maps typed requests to the service and returns one error envelope.

The persistence layer uses SQLite with transactional writes. Schema includes:
- `games` table: stores serialized game config, queue, status, and timestamps
- `participants` table: player/team names and current scores
- `score_events` table: append-only scoring history with reversal flags

Game state survives backend restarts. The `.data/` directory (gitignored) holds the SQLite database (default: `.data/quiz.db`).

The fake adapter and domain tests make all automated checks credential-free. E2E tests use the fake catalog and verify UI behavior, concealment logic, and accessibility compliance.

