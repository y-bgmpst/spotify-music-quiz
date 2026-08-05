# Win95 / Netscape Navigator Design Generation Prompt

Use this prompt when generating or redesigning the Spotify Music Quiz interface. The output must be an implementable UI for the existing React/Vite application, not a generic retro poster.

## Prompt

Design a production-quality desktop-first web interface for a private Spotify music guessing game called **Spotify Music Quiz — 90s Edition**.

Create an authentic, usable Windows 95 desktop environment containing a Netscape Navigator 3.x-style browser window. The result should feel like a real late-1990s computer interface that happens to run a quiz, not a modern app with a few retro colors.

### Visual language

- Use a 4:3-first composition that remains usable at 800×600 and scales cleanly to 1280×800.
- Use the classic Windows 95 palette: cool gray window chrome, navy title bars, white content surfaces, dark navy text, muted teal desktop background, and restrained system blue selection states.
- Use hard 1px borders, authentic raised and sunken bevels, square corners, compact spacing, bitmap-like separators, and visibly physical controls.
- Prefer a system UI stack or a pixel-compatible bitmap font. Avoid rounded SaaS cards, gradients, glassmorphism, oversized whitespace, soft shadows, neon cyberpunk colors, and contemporary dashboard patterns.
- Include a desktop background with a simple Frankfurt skyline silhouette, but keep it low contrast so the quiz remains readable.
- Use small, purposeful icons for My Computer, Network Neighborhood, Recycle Bin, Spotify Quiz, and Help. Icons must be crisp and aligned to a grid.

### Netscape Navigator shell

Build the main quiz inside a believable browser window with:

- a dark blue title bar reading `Netscape Navigator — Spotify Music Quiz`;
- minimize, maximize, and close buttons with classic beveled states;
- a menu bar: File, Edit, View, Go, Bookmarks, Options, Directory, Help;
- a toolbar with Back, Forward, Reload, Home, Search, and Stop controls;
- a location bar showing a harmless local URL such as `http://127.0.0.1:5173/quiz`;
- a small Netscape-style status bar and connection indicator;
- a content viewport that clearly contains the quiz, not a modern full-screen app.

### Quiz UX

Design these states as a coherent state machine:

1. Welcome / login state with a clear Spotify Login button and local fake-playlist option.
2. Playlist selection state with compact list rows, owner, track count, and eligibility summary.
3. Game setup state for teams, rounds, excerpt mode, duration, and point values.
4. Ready state with a large Start Round button and visible round counter.
5. Guessing state with a masked record/CD graphic, countdown display, playback status, pause and reveal controls.
6. Revealed state showing title, all artists, album, cover, score controls, and next-round action.
7. Finished state showing ranked standings, tie handling, completed rounds, and new-game action.
8. Error states for missing Spotify authentication, unavailable playback device, rate limiting, empty playlists, and failed requests. Every error needs a plain-language explanation and a concrete recovery action.

### Interaction details

- Buttons must have distinct raised, hover, pressed, disabled, and focus-visible states.
- Menus and toolbar buttons should be keyboard reachable and provide tooltips or status text.
- Dragging the browser window may be simulated visually, but never compromise usability on small screens.
- Preserve clear focus order and readable labels for keyboard and screen-reader users.
- Respect `prefers-reduced-motion`; use blinking or animated effects sparingly and never for essential information.
- Keep identifying track metadata completely absent from the DOM, ARIA labels, page title, logs, and media-session metadata until the backend reveal state allows it.
- Do not put Spotify audio, previews, or answer data into generated mockups or client-side fixtures beyond what the current reveal state requires.

### Copy and tone

Use concise period-appropriate labels such as `START QUIZ`, `REVEAL ANSWER`, `NEXT ROUND`, `CONNECT`, `RELOAD`, `STATUS`, and `SCOREBOARD`. Keep the tone playful and nostalgic without turning every label into an emoji.

### Deliverables

Provide:

- a desktop and responsive layout specification;
- color, typography, spacing, border, bevel, and icon tokens;
- the component/state map for React implementation;
- empty, loading, error, guessing, reveal, and finished states;
- accessibility notes;
- a short list of changes that should be made in the existing frontend files.

Do not introduce a modern UI framework solely for decoration. Reuse the existing React components and CSS structure where practical, and keep the backend-authoritative game state and Spotify security boundaries intact.
