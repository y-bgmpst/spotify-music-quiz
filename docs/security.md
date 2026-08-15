# Security

- OAuth uses PKCE S256, random state, exact loopback redirect validation, and one-time state consumption.
- OAuth state is bound to the initiating session hash; a missing, different, expired, or replayed session/state pair is rejected. Successful login rotates the session identifier and invalidates the pre-auth session.
- Logout removes the server-side token and session and expires the browser cookie.
- Tokens, authorization codes, state, and PKCE verifiers are never logged. Access tokens remain server-side in SQLite and are returned only by the authenticated `/api/v1/auth/token` endpoint for the active HttpOnly session; the frontend does not persist them in Web Storage.
- No client secret is accepted by frontend code. CORS is restricted to the configured frontend origin.
- Answer metadata is not returned in the round payload before reveal. The concealed UI receives only round number, status, duration, and a playback URI held by the playback boundary.
- No Spotify audio is downloaded, cached, recorded, transformed, or persisted. Media Session metadata is disabled for the SDK player.
- This is a private local MVP, not a production multi-user deployment. The current opaque session is intentionally single-user (`default`) and is not a full identity system. Before deployment, add user-bound sessions, CSP headers, CSRF protection for cookie-authenticated mutations, and a durable transactional repository.
- `Secure` is configurable through `SESSION_COOKIE_SECURE`; it remains `false` for the documented local HTTP loopback setup and must be enabled when serving over HTTPS. `SameSite=Lax` is a useful mitigation, not a complete CSRF defense.
