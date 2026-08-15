# Architecture

The backend is authoritative for game configuration, normalized catalog data, fixed queue, excerpt position, state transitions, reveal state, participants, and append-only score events. The frontend owns the single Web Playback SDK instance and renders the server state.

`music_quiz.domain` contains pure Python rules with no HTTP, Spotify, or persistence imports. `music_quiz.spotify` exposes a protocol, explicit fake implementation, and `SpotifyWebCatalog` HTTP implementation with paginated playlist reads. `music_quiz.persistence` provides a repository protocol with SQLite implementation for durable game state storage. `music_quiz.api` (main.py) maps typed requests to the service and returns one error envelope.

The persistence layer uses SQLite with transactional writes. `DATABASE_PATH` is normalized once at startup to an absolute path (relative values are resolved from the repository/application root), and its parent directory is created before all repositories are initialized. The game repository, token repository, and OAuth state store therefore share one database file across requests, reloads, and repository instances.

Authentication uses a server-side opaque `spotify_quiz_session` HttpOnly cookie. Login creates or reuses a pending browser session, and the OAuth state stores only its hash alongside the PKCE verifier. Callback consumption requires that same session, then exchanges the code, durably saves the token, rotates to a new authenticated session, invalidates the pending session, and redirects with `auth_callback=success`; the frontend verifies `/auth/status` before showing connected state.

The persistence layer uses SQLite with transactional writes. Schema includes:
- `games` table: stores serialized game config, queue, status, and timestamps
- `participants` table: player/team names and current scores
- `score_events` table: append-only scoring history with reversal flags

Game state survives backend restarts. The `.data/` directory (gitignored) holds the SQLite database (default: `.data/quiz.db`).

The fake adapter is selected only with `FAKE_SPOTIFY=true`; otherwise missing authentication is an explicit error. The authenticated frontend loads real playlists, sends the selected playlist ID, and uses `SpotifyWebPlayback`. E2E tests run with explicit fake mode and verify UI behavior, concealment logic, OAuth callback status derivation, and accessibility compliance. Live Spotify OAuth and audio remain manual checks.
