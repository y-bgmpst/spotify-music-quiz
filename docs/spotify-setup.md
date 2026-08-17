# Spotify setup

1. Create an app in the Spotify Developer Dashboard.
2. Add the exact redirect URI `http://127.0.0.1:8000/api/v1/auth/callback`; do not use `localhost`.
3. Allowlist the host account in Development Mode. Web Playback requires Premium.
4. Copy the Client ID into `.env`. Do not put a Client Secret in the frontend.
5. The app requests `streaming user-read-private user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative`. Playlist modify scopes are not requested by the quiz login; the separate importer owns its additional permissions.
6. Start the backend and frontend, sign in, and activate the named browser player.

Common failures: `account_error` means Premium is unavailable; `authentication_error` means the token must be renewed; `initialization_error` commonly indicates unsupported protected media; `autoplay_failed` requires a user gesture. Reconnect from the UI after fixing the cause.

The frontend treats `auth_callback=success` only as a callback completion signal. It calls `/api/v1/auth/status` and shows “Spotify account connected” only when that response is `authenticated: true`; otherwise it shows a reauthentication error.

Manual live check: authenticate with a real Premium account, choose a playlist, verify a round plays and pauses, verify no answer metadata is visible before reveal, reveal the answer, award/reverse points, and complete the final standings. Do not claim this check passed until it is actually performed.
