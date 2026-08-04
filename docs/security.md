# Security

- OAuth uses PKCE S256, random state, exact loopback redirect validation, and one-time state consumption.
- Tokens, authorization codes, state, and PKCE verifiers are never logged. The browser adapter keeps the access token only in session storage for the active local session.
- No client secret is accepted by frontend code. CORS is restricted to the configured frontend origin.
- Answer metadata is not returned in the round payload before reveal. The concealed UI receives only round number, status, duration, and a playback URI held by the playback boundary.
- No Spotify audio is downloaded, cached, recorded, transformed, or persisted. Media Session metadata is disabled for the SDK player.
- This is a private local MVP, not a production multi-user deployment. Before deployment, add secure server-side sessions, CSP headers, CSRF protection for cookie auth, and a durable transactional repository.

