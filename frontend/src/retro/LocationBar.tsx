import { RetroIcon } from './icons';

interface LocationBarProps {
  /** Current playlist context, e.g. a Spotify URI or an imported file name. */
  value: string;
  onImport: () => void;
}

/**
 * The Netscape location bar, repurposed as the playlist context line.
 *
 * It is read-only on purpose: the playlist is chosen through the import and
 * Spotify flows, so an editable field would promise an action the backend does
 * not offer yet.
 */
export function LocationBar({ value, onImport }: LocationBarProps) {
  return (
    <div className="retro-locationbar">
      <label className="retro-locationbar-label" htmlFor="playlist-location">
        Playlist:
      </label>
      <input
        id="playlist-location"
        className="retro-locationbar-input"
        type="text"
        readOnly
        value={value}
      />
      <button type="button" className="retro-button" onClick={onImport}>
        <RetroIcon name="import" />
        <span>Auswählen…</span>
      </button>
    </div>
  );
}
