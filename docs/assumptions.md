# Assumptions and verified platform facts

Checked 2026-08-03 against official Spotify documentation:

- Browser authentication uses Authorization Code with PKCE and S256; no client secret is used in the frontend.
- Local redirects use `http://127.0.0.1:8000/api/v1/auth/callback`; Spotify does not allow `localhost` as a redirect URI. Sources: [PKCE flow](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow), [redirect URIs](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri).
- Web Playback SDK requires a Spotify Premium account and the `streaming` scope. Source: [Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk/tutorials/getting-started).
- Playlist reading uses `playlist-read-private` and `playlist-read-collaborative` where applicable. Source: [playlist scopes](https://developer.spotify.com/documentation/web-api/concepts/playlists).
- Spotify 429 responses should be retried only after the `Retry-After` delay. Source: [rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits).

The server stores only game metadata and score events. Spotify audio is never stored or transformed. Automated tests use fake data. Live SDK playback is an explicit manual verification step.

