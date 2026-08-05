/**
 * Retro pixel icons.
 *
 * Every glyph is drawn here by hand on a 16x16 grid. Nothing is traced from,
 * extracted from, or derived from Microsoft, Netscape, or Spotify artwork, so
 * the project ships no third-party image assets. See THIRD_PARTY_NOTICES.md.
 *
 * Icons are decorative: each call site supplies the accessible name on the
 * surrounding control, and the SVG itself is hidden from assistive tech.
 */

export type RetroIconName =
  | 'app'
  | 'play'
  | 'pause'
  | 'stop'
  | 'next'
  | 'back'
  | 'reveal'
  | 'import'
  | 'spotify'
  | 'scoreboard'
  | 'settings'
  | 'help'
  | 'error'
  | 'loading'
  | 'audio';

interface PixelIconProps {
  name: RetroIconName;
  /** Rendered size in CSS pixels. Use integer multiples of 16 to stay crisp. */
  size?: 16 | 32;
  className?: string;
}

/** Palette shared by all glyphs so the icon set reads as one family. */
const INK = '#000000';
const SHADE = '#808080';
const PAPER = '#ffffff';
const HILITE = '#ffff00';
const GREEN = '#008000';
const RED = '#a80000';
const BLUE = '#000080';
const CYAN = '#00a8a8';

function glyph(name: RetroIconName) {
  switch (name) {
    case 'app':
      return (
        <>
          <rect x="1" y="2" width="14" height="12" fill={BLUE} />
          <rect x="2" y="3" width="12" height="10" fill={CYAN} />
          <rect x="6" y="5" width="2" height="6" fill={INK} />
          <rect x="8" y="4" width="2" height="2" fill={INK} />
          <rect x="4" y="9" width="4" height="3" fill={INK} />
        </>
      );
    case 'play':
      return (
        <>
          <rect x="4" y="2" width="2" height="12" fill={INK} />
          <rect x="6" y="4" width="2" height="8" fill={GREEN} />
          <rect x="8" y="6" width="2" height="4" fill={GREEN} />
          <rect x="10" y="7" width="2" height="2" fill={GREEN} />
        </>
      );
    case 'pause':
      return (
        <>
          <rect x="4" y="3" width="3" height="10" fill={INK} />
          <rect x="9" y="3" width="3" height="10" fill={INK} />
          <rect x="5" y="4" width="1" height="8" fill={PAPER} />
          <rect x="10" y="4" width="1" height="8" fill={PAPER} />
        </>
      );
    case 'stop':
      return (
        <>
          <rect x="3" y="3" width="10" height="10" fill={INK} />
          <rect x="4" y="4" width="8" height="8" fill={RED} />
        </>
      );
    case 'next':
      return (
        <>
          <rect x="3" y="4" width="2" height="8" fill={INK} />
          <rect x="5" y="5" width="2" height="6" fill={INK} />
          <rect x="7" y="6" width="2" height="4" fill={INK} />
          <rect x="11" y="3" width="2" height="10" fill={SHADE} />
        </>
      );
    case 'back':
      return (
        <>
          <rect x="11" y="4" width="2" height="8" fill={INK} />
          <rect x="9" y="5" width="2" height="6" fill={INK} />
          <rect x="7" y="6" width="2" height="4" fill={INK} />
          <rect x="3" y="3" width="2" height="10" fill={SHADE} />
        </>
      );
    case 'reveal':
      return (
        <>
          <rect x="2" y="6" width="12" height="4" fill={PAPER} />
          <rect x="2" y="6" width="12" height="1" fill={INK} />
          <rect x="2" y="9" width="12" height="1" fill={INK} />
          <rect x="6" y="5" width="4" height="6" fill={HILITE} />
          <rect x="7" y="6" width="2" height="4" fill={INK} />
        </>
      );
    case 'import':
      return (
        <>
          <rect x="2" y="4" width="12" height="9" fill={HILITE} />
          <rect x="2" y="3" width="6" height="2" fill={HILITE} />
          <rect x="2" y="3" width="12" height="1" fill={INK} />
          <rect x="2" y="12" width="12" height="1" fill={INK} />
          <rect x="7" y="5" width="2" height="4" fill={INK} />
          <rect x="5" y="8" width="6" height="1" fill={INK} />
          <rect x="6" y="9" width="4" height="1" fill={INK} />
        </>
      );
    case 'spotify':
      return (
        <>
          <rect x="3" y="3" width="10" height="10" fill={GREEN} />
          <rect x="4" y="5" width="8" height="2" fill={PAPER} />
          <rect x="5" y="8" width="6" height="1" fill={PAPER} />
          <rect x="6" y="10" width="4" height="1" fill={PAPER} />
        </>
      );
    case 'scoreboard':
      return (
        <>
          <rect x="2" y="2" width="12" height="12" fill={PAPER} />
          <rect x="2" y="2" width="12" height="2" fill={BLUE} />
          <rect x="3" y="6" width="3" height="6" fill={INK} />
          <rect x="7" y="8" width="3" height="4" fill={SHADE} />
          <rect x="11" y="5" width="2" height="7" fill={RED} />
        </>
      );
    case 'settings':
      return (
        <>
          <rect x="6" y="2" width="4" height="12" fill={SHADE} />
          <rect x="2" y="6" width="12" height="4" fill={SHADE} />
          <rect x="5" y="5" width="6" height="6" fill={INK} />
          <rect x="6" y="6" width="4" height="4" fill={PAPER} />
        </>
      );
    case 'help':
      return (
        <>
          <rect x="3" y="2" width="10" height="12" fill={PAPER} />
          <rect x="3" y="2" width="10" height="1" fill={INK} />
          <rect x="3" y="13" width="10" height="1" fill={INK} />
          <rect x="6" y="4" width="4" height="2" fill={BLUE} />
          <rect x="8" y="6" width="2" height="2" fill={BLUE} />
          <rect x="7" y="8" width="2" height="2" fill={BLUE} />
          <rect x="7" y="11" width="2" height="2" fill={BLUE} />
        </>
      );
    case 'error':
      return (
        <>
          <rect x="3" y="3" width="10" height="10" fill={RED} />
          <rect x="5" y="5" width="2" height="2" fill={PAPER} />
          <rect x="9" y="5" width="2" height="2" fill={PAPER} />
          <rect x="7" y="7" width="2" height="2" fill={PAPER} />
          <rect x="5" y="9" width="2" height="2" fill={PAPER} />
          <rect x="9" y="9" width="2" height="2" fill={PAPER} />
        </>
      );
    case 'loading':
      return (
        <>
          <rect x="2" y="5" width="12" height="6" fill={PAPER} />
          <rect x="2" y="5" width="12" height="1" fill={INK} />
          <rect x="2" y="10" width="12" height="1" fill={INK} />
          <rect x="3" y="6" width="3" height="4" fill={BLUE} />
          <rect x="7" y="6" width="3" height="4" fill={BLUE} />
        </>
      );
    case 'audio':
      return (
        <>
          <rect x="3" y="6" width="3" height="4" fill={INK} />
          <rect x="6" y="4" width="3" height="8" fill={INK} />
          <rect x="10" y="5" width="1" height="6" fill={CYAN} />
          <rect x="12" y="3" width="1" height="10" fill={CYAN} />
        </>
      );
  }
}

export function RetroIcon({ name, size = 16, className }: PixelIconProps) {
  return (
    <svg
      className={['retro-icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      focusable="false"
      aria-hidden="true"
      role="presentation"
    >
      {glyph(name)}
    </svg>
  );
}
