# Spotify Setup Instructions

## 1. Create Spotify App

1. Go to https://developer.spotify.com/dashboard
2. Click "Create app"
3. Fill in:
   - **App name:** Spotify Music Quiz (or whatever you prefer)
   - **App description:** Local playlist guessing game
   - **Redirect URI:** `http://127.0.0.1:8000/api/v1/auth/callback`
     ⚠️ Use `127.0.0.1`, NOT `localhost`
   - **Which API/SDKs are you planning to use?** Check "Web Playback SDK"
4. Click "Save"

## 2. Get Client ID

1. In your app dashboard, click "Settings"
2. Copy the **Client ID** (don't need Client Secret for PKCE)
3. Paste it into `.env` file:

```bash
SPOTIFY_CLIENT_ID=abc123your-client-id-here
```

## 3. Whitelist Your Account (Development Mode)

Since your app is in Development Mode:
1. Go to app Settings → User Management
2. Add your Spotify email/username
3. Max 25 users in Development Mode

## 4. Premium Required

⚠️ **Web Playback SDK requires Spotify Premium**

## 5. Start the App

```bash
# Terminal 1 - Backend
.venv/bin/uvicorn music_quiz.main:app --reload --app-dir backend/src

# Terminal 2 - Frontend  
npm --prefix frontend run dev
```

## 6. Login Flow

1. Open http://127.0.0.1:5173
2. Click login (will redirect to Spotify)
3. Authorize the app
4. Redirected back → Token saved to SQLite
5. After restart → Token auto-refreshes (no re-login needed)

## Troubleshooting

### "INVALID_CLIENT: Invalid client id"
Spotify rejects the Client ID. Check, in this order:
- The value in `.env` is the **Client ID** from the app dashboard - not the Client Secret,
  not the app URL, not the app name.
- It is exactly 32 lowercase hexadecimal characters, with no quotes, spaces or trailing
  comment on the `SPOTIFY_CLIENT_ID=` line.
- The Spotify app still exists and is not deleted or in a different account.

The backend now validates this locally: run the server and open
`http://127.0.0.1:8000/api/v1/config`. If the format is wrong, `problems` names the exact
issue and sign-in stays disabled instead of sending you to Spotify's error page.

### "Invalid redirect URI"
- Make sure you used `http://127.0.0.1:8000/api/v1/auth/callback` (not localhost)
- Check it's saved in Spotify Dashboard → Settings → Redirect URIs

### "Premium required"
- Web Playback SDK only works with Premium accounts
- Use `FAKE_SPOTIFY=true` in `.env` for testing without Premium

### Token expires
- Refresh tokens last indefinitely (until revoked)
- Auto-refresh happens automatically when access token expires (1h)

## Current Token Status

Check if you have a token:
```bash
sqlite3 .data/quiz.db "SELECT user_id, expires_at, datetime(expires_at, 'unixepoch') FROM auth_tokens;"
```

Delete token (logout):
```bash
sqlite3 .data/quiz.db "DELETE FROM auth_tokens;"
```
