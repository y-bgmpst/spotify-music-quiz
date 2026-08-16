import { RetroIcon, type RetroIconName } from './icons';

export interface StatusBarProps {
  /** Short primary state, announced politely when it changes. */
  connection: string;
  connectionIcon: RetroIconName;
  round?: string;
  players?: string;
  clock?: string;
}

/**
 * Classic status bar.
 *
 * Only the connection cell is inside the live region: the countdown ticks
 * every fraction of a second and would otherwise flood a screen reader.
 */
export function StatusBar({
  connection,
  connectionIcon,
  round,
  players,
  clock,
}: StatusBarProps) {
  return (
    <div className="retro-statusbar">
      <p className="retro-status-cell retro-status-primary" aria-live="polite">
        <RetroIcon name={connectionIcon} />
        <span>{connection}</span>
      </p>
      {round && <p className="retro-status-cell">{round}</p>}
      {players && <p className="retro-status-cell">{players}</p>}
      {clock && (
        <p className="retro-status-cell retro-status-clock">
          <span className="visually-hidden">Local time: </span>
          <span>{clock}</span>
        </p>
      )}
    </div>
  );
}
