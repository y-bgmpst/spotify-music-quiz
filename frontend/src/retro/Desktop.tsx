import { useEffect, useRef, useState } from 'react';
import { RetroIcon, type RetroIconName } from './icons';

export interface DesktopShortcut {
  id: string;
  label: string;
  icon: RetroIconName;
  onOpen: () => void;
}

export interface StartMenuItem {
  label: string;
  icon: RetroIconName;
  disabled?: boolean;
  onSelect: () => void;
}

/**
 * The Windows 95 desktop the Navigator window sits on.
 *
 * Shortcuts are real buttons rather than double-click-only icons: a
 * double-click is not reachable by keyboard, and the retro look must never
 * cost anyone access to a feature. The visual double-click convention is kept
 * by also opening on double-click, which simply fires the same handler.
 */
export function DesktopIcons({ shortcuts }: { shortcuts: DesktopShortcut[] }) {
  return (
    <ul className="desktop-icons" aria-label="Desktop-Verknüpfungen">
      {shortcuts.map((shortcut) => (
        <li key={shortcut.id}>
          <button
            type="button"
            className="desktop-icon"
            onClick={shortcut.onOpen}
            onDoubleClick={shortcut.onOpen}
          >
            <span className="desktop-icon-image" aria-hidden="true">
              <RetroIcon name={shortcut.icon} size={32} />
            </span>
            <span className="desktop-icon-label">{shortcut.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

interface TaskbarProps {
  /** Label of the single application window shown in the task list. */
  windowTitle: string;
  minimized: boolean;
  onToggleWindow: () => void;
  startItems: StartMenuItem[];
  clock: string;
}

/** Windows 95 taskbar: Start button, task list and tray clock. */
export function Taskbar({
  windowTitle,
  minimized,
  onToggleWindow,
  startItems,
  clock,
}: TaskbarProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Clicking away or pressing Escape closes the Start menu, matching both the
  // original shell and what keyboard users expect from a menu.
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="taskbar" ref={root}>
      <div className="taskbar-start">
        <button
          type="button"
          className="start-button"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((value) => !value)}
        >
          <RetroIcon name="app" />
          <span>Start</span>
        </button>

        {open && (
          <div className="start-menu" role="menu" aria-label="Start">
            <p className="start-menu-spine" aria-hidden="true">
              Back to the 90s
            </p>
            <ul>
              {startItems.map((item) => (
                <li key={item.label}>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(false);
                      item.onSelect();
                    }}
                  >
                    <RetroIcon name={item.icon} />
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="taskbar-tasks">
        <button
          type="button"
          className={minimized ? 'task-button' : 'task-button is-active'}
          aria-pressed={!minimized}
          onClick={onToggleWindow}
        >
          <RetroIcon name="app" />
          <span className="task-button-label">{windowTitle}</span>
        </button>
      </div>

      <div className="taskbar-tray">
        <span className="visually-hidden">Aktuelle Uhrzeit: </span>
        <span className="tray-clock">{clock}</span>
      </div>
    </div>
  );
}
