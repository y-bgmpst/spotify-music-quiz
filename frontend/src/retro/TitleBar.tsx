import { RetroIcon } from './icons';

interface TitleBarProps {
  title: string;
  /** Minimises the window down to its taskbar button. */
  onMinimize: () => void;
  /** Toggles the app-internal focus mode. */
  onMaximize: () => void;
  /** Opens the confirmed reset dialog. */
  onClose: () => void;
  focusMode: boolean;
  minimized: boolean;
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
  minimized,
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
          aria-pressed={minimized}
          aria-label="Fenster minimieren"
          title="Fenster minimieren"
        >
          <span aria-hidden="true">_</span>
        </button>
        <button
          type="button"
          className="retro-window-button"
          onClick={onMaximize}
          aria-pressed={focusMode}
          aria-label={
            focusMode ? 'Fokusmodus verlassen' : 'Fokusmodus aktivieren'
          }
          title={focusMode ? 'Fokusmodus verlassen' : 'Fokusmodus aktivieren'}
        >
          <span aria-hidden="true">□</span>
        </button>
        <button
          type="button"
          className="retro-window-button"
          onClick={onClose}
          aria-label="Quiz beenden"
          title="Quiz beenden"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  );
}
