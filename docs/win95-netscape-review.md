# Win95 / Netscape Navigator Authenticity Review

Updated: 2026-08-05

This is a structured review handover for the next implementation agent. It compares the current `App-win95-desktop.tsx` + `styles-win95-desktop.css` against the design specification in `docs/win95-netscape-design-prompt.md`. No credentials, tokens, or private paths are included.

## Result

The CSS foundation (bevels, palette, button states, border colors) is solid. The taskbar, desktop, and window chrome are authentic Win95. **The Netscape Navigator window is missing all Navigator-specific internal chrome** — it is visually indistinguishable from any generic Windows 95 application window. The design prompt explicitly requires this distinction.

## What exists (verified)

| Implemented | File | Accuracy |
|---|---|---|
| Win95 color palette (`#c0c0c0`, `#808080`, `#000080`, `#008080`) | CSS lines 3-13 | Correct |
| Beveled borders (raised/sunken/inverse pattern) | CSS lines 128-131, 206-209, 305-310 | Correct |
| Button states (raised, active with 1px nudge, disabled with etched text-shadow) | CSS lines 396-415 | Correct |
| Window title bar gradient (`navy → #1084d0`) | CSS lines 224-231 | Correct |
| Draggable window via titlebar mousedown | TSX lines 218-225 | Correct |
| Desktop icons with selection (click, ctrl+click) | TSX lines 201-215, 28-68 | Correct |
| Taskbar (Start button, task items, system tray, clock) | TSX lines 596-623 | Correct |
| Netscape N logo (16px + 20px throbber) | CSS lines 246-260, 263-281 | Correct |
| Throbber pulse animation (`netscape-pulse`) | CSS lines 287-297 | Correct |
| Frankfurt skyline SVG (teal background, 12% opacity navy shapes) | CSS lines 33-36 | Adequate |
| Loading screen (`public/loading.html`) with fake progress log | File | Good |
| Sound effects (square-wave beeps via Web Audio API) | `src/sounds.ts` | Correct |
| Game state machine (backend via API) | Verified, independent of UI | Correct |

## What is missing (design prompt vs code)

### Priority 1 — Netscape Navigator identity features

These are all from `docs/win95-netscape-design-prompt.md` lines 24-29 ("Netscape Navigator shell"):

| Missing element | Design prompt reference | Where it goes in code |
|---|---|---|
| Menu bar: File, Edit, View, Go, Bookmarks, Options, Directory, Help | Line 26 | New `<div className="window-menubar">` between titlebar (TSX line 308) and window-body (line 310) |
| Toolbar: Back, Forward, Reload, Home, Search, Stop | Line 27 | New `<div className="window-toolbar">` below menubar |
| Location bar showing URL | Line 28 | New `<div className="window-location">` below toolbar |
| Netscape-style status bar + connection indicator | Line 29 | Replace current generic `.window-statusbar` (TSX 437-449) with fieldset with key icon and "Document: Done" label |

Combined these require approximately 20 lines of TSX structure and 80 lines of CSS.

### Priority 2 — Authenticity refinements

| Missing element | Design prompt reference | What to do |
|---|---|---|
| 32x32 pixel-art icons (not emoji) | Line 18 | Replace emoji (`💻🌐🗑️🧭💣`) with CSS pixel-art or small SVG icons |
| Start menu (currently cosmetic only) | Implicit from Win95 desktop | Add a simple menu with Shut Down / Programs entries |

### Priority 3 — Minor

| Missing element | What to do |
|---|---|
| Netscape title bar color | Design prompt says "dark blue title bar" — current is standard Win95 navy gradient. Add a `.netscape-titlebar` override or separate color token. |
| `prefers-reduced-motion` support for throbber, blink, and pulse animations | Add `@media (prefers-reduced-motion: reduce)` blocks to `styles-win95-desktop.css` |
| Fake CD/record graphic for guessing state | Design prompt line 41 mentions "masked record/CD graphic" — not implemented |

## Files to modify (in order)

1. **`frontend/src/App-win95-desktop.tsx`** — Add menubar, toolbar, location bar, netscape statusbar to the window component
2. **`frontend/src/styles-win95-desktop.css`** — Add CSS for `.window-menubar`, `.window-toolbar`, `.window-location`, `.netscape-statusbar` classes
3. **`frontend/src/styles-win95-desktop.css`** — Add `prefers-reduced-motion` media query blocks
4. **`frontend/src/App-win95-desktop.tsx`** — Replace emoji icons with CSS/SVG pixel-art (optional, Priority 2)

## Key code locations

```
App-win95-desktop.tsx:
  Line 277-308   Window container + titlebar (insert menubar/toolbar/location after 308)
  Line 437-449   Current generic statusbar (replace with Netscape-style)
  Lines 28-68    Desktop icon definitions (emoji → pixel-art mapping)

styles-win95-desktop.css:
  Lines 224-232  .window-titlebar (add .netscape-titlebar override)
  Lines 334-342  .window-statusbar (add/replace with Netscape-specific)
  Lines 287-297  @keyframes netscape-pulse (add prefers-reduced-motion guard)
  Line 490-498   @keyframes blink (add prefers-reduced-motion guard)
```

## Menubar CSS snippet (starting point)

```css
.window-menubar {
  background: var(--win95-gray);
  border-bottom: 1px solid var(--win95-dark-gray);
  padding: 1px 4px;
  display: flex;
  gap: 0;
  font-size: 11px;
}

.menubar-item {
  padding: 2px 6px;
  cursor: pointer;
  white-space: nowrap;
}

.menubar-item:hover {
  background: var(--win95-blue);
  color: var(--win95-white);
}
```

## Toolbar CSS snippet (starting point)

```css
.window-toolbar {
  background: var(--win95-gray);
  border-bottom: 1px solid var(--win95-dark-gray);
  padding: 2px 4px;
  display: flex;
  gap: 2px;
}

.toolbar-button {
  width: 24px;
  height: 24px;
  border: 1px solid transparent;
  background: var(--win95-gray);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toolbar-button:hover {
  border-color: var(--win95-light-gray) var(--win95-dark-gray) var(--win95-dark-gray) var(--win95-light-gray);
}

.toolbar-button:active {
  border-color: var(--win95-dark-gray) var(--win95-light-gray) var(--win95-light-gray) var(--win95-dark-gray);
}
```

## Location bar CSS snippet (starting point)

```css
.window-location {
  background: var(--win95-gray);
  border-bottom: 1px solid var(--win95-dark-gray);
  padding: 3px 6px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
}

.location-label {
  white-space: nowrap;
}

.location-field {
  flex: 1;
  border: 1px solid;
  border-color: var(--win95-dark-gray) var(--win95-white) var(--win95-white) var(--win95-dark-gray);
  background: var(--win95-white);
  padding: 1px 4px;
  font-family: 'MS Sans Serif', sans-serif;
  font-size: 11px;
  user-select: text;
}
```

## Open PRs (none address this issue)

| PR | Title |
|---|---|
| #18 | Repair OAuth sessions and harden local CI |
| #17 | Add Arch Linux CI verification |
| #16 | Frontend deps bump (17 updates) |
| #15 | Backend: uvicorn bump |
| #14 | Backend: pydantic bump |
| #13 | Backend: mypy bump |
| #10 | Harden Spotify playback connection and enforce function limits |

## Quality gate (after changes)

```bash
make verify                              # format + lint + typecheck + test + build
npm --prefix frontend run dev            # visual check at localhost:5173
```
