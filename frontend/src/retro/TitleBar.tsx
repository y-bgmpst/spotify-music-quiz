import { RetroIcon } from './icons';

interface TitleBarProps {
  title: string;
  /** Hides the optional side panels. */
  onMinimize: () => void;
  /** Toggles the app-internal focus mode. */
  onMaximize: () => void;
  /** Opens the confirmed reset dialog. */
  onClose: () => void;
  focusMode: boolean;
  panelsHidden: boolean;
}

/**
 * Windows-95-style title bar.
 *
 * The three window buttons are real controls with real, honest behaviour
 * inside the app: they never pretend to move an OS window.
 */
export function TitleBar({
  title,
  onMinimize,
  onMaximize,
  onClose,
  focusMode,
  panelsHidden,
}: TitleBarProps) {
  return (
    <div className="retro-titlebar">
      <RetroIcon name="app" />
      <h1 className="retro-titlebar-text" id="app-title">
        {title}
      </h1>
      <div className="retro-titlebar-buttons">
        <button
          type="button"
          className="retro-window-button"
          onClick={onMinimize}
          aria-pressed={panelsHidden}
          aria-label={panelsHidden ? 'Show side panels' : 'Hide side panels'}
          title={panelsHidden ? 'Show side panels' : 'Hide side panels'}
        >
          <span aria-hidden="true">_</span>
        </button>
        <button
          type="button"
          className="retro-window-button"
          onClick={onMaximize}
          aria-pressed={focusMode}
          aria-label={focusMode ? 'Leave focus mode' : 'Enter focus mode'}
          title={focusMode ? 'Leave focus mode' : 'Enter focus mode'}
        >
          <span aria-hidden="true">□</span>
        </button>
        <button
          type="button"
          className="retro-window-button"
          onClick={onClose}
          aria-label="Exit quiz"
          title="Exit quiz"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  );
}
