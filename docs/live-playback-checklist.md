# Live Playback Checklist

This checklist covers manual verification of Spotify Web Playback SDK integration with a Premium account. These steps cannot be automated because they require:
- Active Spotify Premium subscription
- Browser with Widevine DRM support
- Real-time audio playback verification
- User interaction with Spotify OAuth

## Prerequisites

- [ ] Spotify Premium account (required for Web Playback SDK)
- [ ] Supported browser: Chrome, Firefox, Edge, or Safari (with DRM enabled)
- [ ] Valid Spotify Developer App credentials configured
- [ ] Test playlist with at least 10 tracks (public or owned by test account)
- [ ] Stable internet connection

## Setup Verification

### 1. Environment Configuration

- [ ] `.env` file exists with valid credentials:
  - `SPOTIFY_CLIENT_ID` - valid OAuth app client ID
  - `SPOTIFY_REDIRECT_URI` - matches registered callback in Spotify Dashboard
  - `FRONTEND_ORIGIN` - matches frontend dev server URL
- [ ] Backend server running: `.venv/bin/uvicorn music_quiz.main:app --reload --app-dir backend/src`
- [ ] Frontend dev server running: `npm --prefix frontend run dev`
- [ ] Backend health check responds: `curl http://127.0.0.1:8000/api/v1/health`

### 2. Spotify App Configuration

- [ ] App registered in [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
- [ ] Redirect URI registered: `http://127.0.0.1:8000/api/v1/auth/callback`
- [ ] Required scopes enabled:
  - `streaming` - for Web Playback SDK
  - `user-read-private` - for account type check
  - `user-read-playback-state` - for playback state
  - `user-modify-playback-state` - for playback control
  - `playlist-read-private` - for private playlists
  - `playlist-read-collaborative` - for collaborative playlists

## OAuth Flow

### 3. Login Process

- [ ] Click "Login with Spotify" (or equivalent button in UI)
- [ ] Browser redirects to Spotify authorization page
- [ ] Spotify shows app name and requested scopes
- [ ] Click "Agree" to authorize
- [ ] Browser redirects back to frontend with `?auth_callback=success`; the UI then verifies `/api/v1/auth/status`
- [ ] Frontend shows authenticated state (user indicator or playlist selection)
- [ ] No errors in browser console during OAuth flow
- [ ] Network tab shows successful token exchange

### 4. Premium Account Detection

- [ ] Application detects Premium account status
- [ ] If Free account: clear error message displayed ("Spotify Premium required for playback")
- [ ] If Premium account: playback features enabled
- [ ] Reauthentication option available if needed

## Web Playback SDK

### 5. Device Initialization

- [ ] Web Playback SDK script loads without errors
- [ ] Device initializes with name "Spotify Music Quiz" (or configured name)
- [ ] Device appears in Spotify Connect device list on other devices/apps
- [ ] Device ready state is indicated in UI
- [ ] Console logs show "Device ID: ..." (for debugging)
- [ ] No authentication errors in console

### 6. Device Error Handling

Test error scenarios by:
- [ ] Opening app in incognito/private browsing (may block DRM)
  - Expected: Clear error message about browser compatibility
- [ ] Disconnecting internet during device init
  - Expected: Timeout error with retry option
- [ ] Revoking app permissions in Spotify account settings
  - Expected: Authentication error with reauth prompt

## Playlist Selection & Loading

### 7. Playlist Retrieval

- [ ] User's playlists load and display
- [ ] Playlist covers render correctly
- [ ] Private playlists are visible (if scope granted)
- [ ] Collaborative playlists are visible (if scope granted)
- [ ] Track counts display accurately
- [ ] Large playlists (100+ tracks) load completely via pagination
- [ ] Search/filter works (if implemented)

### 8. Playlist Analysis

- [ ] Select a test playlist
- [ ] Eligibility analysis shows:
  - Total items
  - Eligible unique tracks
  - Duplicates removed
  - Unavailable/unsupported items
  - Tracks too short for excerpt settings
- [ ] Analysis completes within reasonable time (< 10 seconds for 100-track playlist)
- [ ] Cannot proceed with 0 eligible tracks

## Game Configuration & Playback

### 9. Game Creation

- [ ] Configure game settings (rounds, excerpt duration, teams)
- [ ] Create game successfully
- [ ] Queue is generated (verify round count matches config)
- [ ] Game enters READY state
- [ ] No track appears twice in queue (check via backend logs or API)

### 10. Excerpt Playback - Intro Mode

Configure game with **intro mode**, 10-second excerpts:

- [ ] Start first round
- [ ] Audio begins playing immediately from track start (0:00)
- [ ] Playback is audible through system speakers/headphones
- [ ] Audio quality is acceptable (no distortion, stuttering)
- [ ] Timer counts down from 10 seconds
- [ ] Playback auto-pauses at 10 seconds
- [ ] Timer shows "0s" when paused
- [ ] Console shows no playback errors

### 11. Excerpt Playback - Random Mode

Configure game with **random mode**, 10-second excerpts:

- [ ] Start round
- [ ] Audio begins playing from middle of track (not intro)
- [ ] Playback starts within valid range (respects intro/outro guards)
- [ ] Multiple rounds use different random positions
- [ ] Short tracks (< 45 seconds) are excluded OR handled gracefully
- [ ] Playback auto-pauses after 10 seconds
- [ ] Same excerpt position used if round is replayed

### 12. Playback Controls

During an active excerpt:

- [ ] **Pause button**: Audio stops, timer freezes
- [ ] **Resume button**: Audio resumes from same position, timer continues
- [ ] **Replay** (if implemented): Same track/position replays, timer resets
- [ ] Controls remain responsive (no double-click issues)
- [ ] Repeated pause/resume works correctly
- [ ] Network lag doesn't cause duplicate playback

### 13. Reveal Behavior

- [ ] Click "Reveal answer" while playing
- [ ] Audio stops immediately (no continued playback)
- [ ] Answer displays: title, artists, album, cover image
- [ ] Cover image loads correctly
- [ ] Multiple artists displayed correctly (comma-separated)
- [ ] No "undefined" or "[object Object]" displayed

### 14. Round Progression

- [ ] Advance to next round
- [ ] Previous track does not repeat
- [ ] New round enters READY state
- [ ] Playback of new round works correctly
- [ ] Round counter increments (e.g., "ROUND 2 / 10")
- [ ] Complete all rounds without errors

### 15. Multi-Round Stability

Test with 10-round game:

- [ ] No memory leaks (check browser memory usage)
- [ ] No accumulating playback errors
- [ ] Audio remains synchronized with timer
- [ ] Device stays connected throughout
- [ ] Page remains responsive

## Error Handling

### 16. Network Interruptions

- [ ] Disconnect internet mid-game
  - Expected: Playback fails with clear error
  - Expected: Retry or reconnect option available
- [ ] Reconnect internet
  - Expected: Can resume game or restart round

### 17. Track Unavailability

- [ ] Play game with playlist containing unavailable tracks
  - Expected: Unavailable tracks excluded during analysis
  - Expected: Game proceeds with only available tracks
- [ ] If current track becomes unavailable mid-game
  - Expected: Error message, option to skip round

### 18. Rate Limiting

- [ ] Rapidly create/delete games or fetch playlists
  - Expected: Backend respects Spotify 429 rate limits
  - Expected: UI shows "Rate limited, retry after X seconds"
  - Expected: Automatic retry after delay (if implemented)

### 19. SDK Disconnection

- [ ] Transfer playback to another device (via Spotify app)
  - Expected: Quiz detects device is no longer active
  - Expected: Error message with reconnect option
- [ ] Reconnect device
  - Expected: Game state restores, can resume

### 20. Session Expiration

- [ ] Wait for access token to expire (~1 hour)
  - Expected: Backend attempts token refresh
  - Expected: If refresh fails, prompt for reauth
  - Expected: Game state preserved after reauth

## State Persistence

### 21. Page Refresh During Game

- [ ] Start game, play 2-3 rounds
- [ ] Refresh browser page
  - Expected: Game state restores (round number, scores)
  - Expected: Can continue from current round
  - Expected: Device reconnects automatically
  - Expected: Queue remains the same (no repeated tracks)

### 22. Backend Restart During Game

- [ ] Start game, play 2-3 rounds
- [ ] Stop backend server
- [ ] Restart backend server
- [ ] Refresh frontend
  - Expected: Game state loaded from SQLite
  - Expected: Can continue game
  - Expected: Previous scores preserved

## Edge Cases

### 23. Very Short Tracks

- [ ] Playlist with tracks < 45 seconds
  - Expected: Short tracks excluded or handled
  - Expected: Error explains why tracks excluded

### 24. Explicit Content Filtering

- [ ] Enable "exclude explicit" setting
  - Expected: Explicit tracks excluded from queue
  - Expected: Eligibility count reflects exclusion

### 25. Single-Track Playlist

- [ ] Configure 10 rounds with 5-track playlist
  - Expected: Error: "Requested rounds exceed eligible tracks"
  - Expected: Cannot create game

### 26. Local Files

- [ ] Playlist containing local files (non-Spotify tracks)
  - Expected: Local files excluded from queue
  - Expected: Only Spotify tracks playable

## Security & Privacy

### 27. Token Handling

- [ ] Inspect network traffic (browser DevTools)
  - Expected: No access tokens in frontend localStorage
  - Expected: No tokens logged to console
  - Expected: Tokens only in secure HTTP-only cookies (if implemented)
- [ ] Check backend logs
  - Expected: No access tokens logged

### 28. OAuth State Validation

- [ ] Manually craft callback URL with invalid state parameter
  - Expected: Error: "Invalid OAuth state"
  - Expected: No token exchange occurs

### 29. PKCE Verification

- [ ] Inspect OAuth authorization URL
  - Expected: Contains `code_challenge` parameter
  - Expected: Contains `code_challenge_method=S256`
- [ ] Verify backend uses correct code_verifier during exchange

## Performance

### 30. Playlist Load Time

- [ ] Load 500-track playlist
  - Expected: Completes within 30 seconds
  - Expected: UI remains responsive during load

### 31. Device Initialization Time

- [ ] Measure time from page load to "Device ready"
  - Expected: < 5 seconds on normal connection
  - Expected: Progress indicator shown during init

## Known Limitations (Document Any Encountered)

Record any issues found:
- Browser-specific problems (e.g., Safari DRM restrictions)
- Playlist size limits
- Audio quality issues
- Latency problems
- Unsupported track formats

## Checklist Summary

**Completed:** ___ / 31 sections  
**Issues Found:** ___  
**Blockers:** ___  
**Notes:**

---

## Testing Notes Template

```
Date: YYYY-MM-DD
Tester: [Name]
Browser: [Chrome/Firefox/Safari/Edge] [Version]
OS: [Linux/Windows/macOS]
Account: [Premium/Free]

Results:
- Section X: [Pass/Fail/Blocked]
  - Issue: [Description]
  - Severity: [Critical/High/Medium/Low]
  - Workaround: [If any]

Overall Status: [Ready for Production / Needs Work]
```
