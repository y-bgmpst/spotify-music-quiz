# Security

- OAuth uses PKCE S256, random state, exact loopback redirect validation, and one-time state consumption.
- OAuth state is bound to the initiating session hash; a missing, different, expired, or replayed session/state pair is rejected. Multiple pending states per session are independent, so parallel tabs are supported. Successful login rotates the session identifier and invalidates the pre-auth session while rebinding remaining pending states to the new session.
- State consumption is transactional and occurs before token exchange. A failed exchange therefore leaves the state consumed; recovery requires a new login, never callback replay.
- Pending state and session records are stored in SQLite, so an application restart does not invalidate an otherwise-live flow. A missing or deleted database/session fails closed.
- Logout removes the server-side token and session and expires the browser cookie.
- Tokens, authorization codes, state, and PKCE verifiers are never logged. Access tokens remain server-side in SQLite and are returned only by the authenticated `/api/v1/auth/token` endpoint for the active HttpOnly session; the frontend does not persist them in Web Storage.
- No client secret is accepted by frontend code. CORS is restricted to the configured frontend origin.
- Frontend API requests use `credentials: include` so the server-side session cookie is sent consistently from the separate frontend origin.
- The documented local Uvicorn and portable starts disable access logging. Request URIs must not be logged because OAuth callback query parameters contain the authorization code and state.
- Answer metadata is not returned in the round payload before reveal. The concealed UI receives only round number, status, duration, and a playback URI held by the playback boundary.
- No Spotify audio is downloaded, cached, recorded, transformed, or persisted. Media Session metadata is disabled for the SDK player.
- This is a private local MVP, not a production multi-user deployment. The current opaque session is intentionally single-user (`default`) and is not a full identity system. Before deployment, add user-bound sessions, CSP headers, CSRF protection for cookie-authenticated mutations, and a durable transactional repository.
- `Secure` is configurable through `SESSION_COOKIE_SECURE`; it remains `false` for the documented local HTTP loopback setup and must be enabled when serving over HTTPS. `SameSite=Lax` is a useful mitigation, not a complete CSRF defense.
