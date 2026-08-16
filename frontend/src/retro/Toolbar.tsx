import { RetroIcon, type RetroIconName } from './icons';

export interface ToolbarAction {
  id: string;
  /** Short Netscape-style caption. */
  label: string;
  /** Full accessible name, e.g. "Reveal answer". */
  description: string;
  icon: RetroIconName;
  onSelect: () => void;
  disabled?: boolean;
  /** Set for toggles so the pressed state is exposed, not just drawn. */
  pressed?: boolean;
}

interface ToolbarProps {
  actions: ToolbarAction[];
}

/**
 * Netscape-style icon toolbar.
 *
 * The pixels are 1996; the hit areas are not. Every button keeps a modern
 * minimum target size and a visible focus ring, both defined in retro.css.
 */
export function Toolbar({ actions }: ToolbarProps) {
  return (
    <div
      className="retro-toolbar"
      role="toolbar"
      aria-label="Quiz controls"
      aria-orientation="horizontal"
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="retro-toolbar-button"
          onClick={action.onSelect}
          disabled={action.disabled}
          aria-pressed={action.pressed}
          aria-label={action.description}
          title={action.description}
        >
          <RetroIcon name={action.icon} size={32} />
          <span className="retro-toolbar-label" aria-hidden="true">
            {action.label}
          </span>
        </button>
      ))}
    </div>
  );
}
