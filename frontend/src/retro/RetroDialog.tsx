import { useEffect, useRef } from 'react';
import { RetroIcon, type RetroIconName } from './icons';

interface RetroDialogProps {
  title: string;
  icon?: RetroIconName;
  open: boolean;
  onClose: () => void;
  /** Rendered right-aligned in the classic button row. */
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Element that should own focus when the dialog opens. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(element => element.offsetParent !== null || element === document.activeElement);
}

/**
 * Windows-95 dialog.
 *
 * Uses the native <dialog> modal when the browser provides `showModal`, and
 * falls back to an ARIA modal with a hand-rolled focus trap otherwise (jsdom
 * and older Safari). Both paths restore focus to the opener on close.
 */
export function RetroDialog({
  title,
  icon = 'settings',
  open,
  onClose,
  children,
  footer,
  initialFocusRef,
}: RetroDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = dialogRef.current;
    if (!element) return;

    if (!open) {
      if (typeof element.close === 'function' && element.open) element.close();
      return;
    }

    openerRef.current = document.activeElement as HTMLElement | null;
    if (typeof element.showModal === 'function') {
      if (!element.open) element.showModal();
    } else {
      element.setAttribute('open', '');
    }

    const target = initialFocusRef?.current ?? focusableWithin(element)[0] ?? element;
    target.focus();

    return () => {
      openerRef.current?.focus();
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const element = dialogRef.current;
    if (!element) return;
    const focusable = focusableWithin(element);
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="retro-dialog-layer">
      <dialog
        className="retro-dialog"
        ref={dialogRef}
        aria-modal="true"
        aria-labelledby={`dialog-title-${title.replace(/\W+/g, '-')}`}
        onKeyDown={onKeyDown}
        onCancel={event => {
          event.preventDefault();
          onClose();
        }}
      >
        <div className="retro-titlebar retro-dialog-titlebar">
          <RetroIcon name={icon} />
          <h2 className="retro-titlebar-text" id={`dialog-title-${title.replace(/\W+/g, '-')}`}>
            {title}
          </h2>
          <div className="retro-titlebar-buttons">
            <button
              type="button"
              className="retro-window-button"
              onClick={onClose}
              aria-label={`Close ${title}`}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>
        <div className="retro-dialog-body">{children}</div>
        <div className="retro-dialog-footer">
          {footer ?? (
            <button type="button" className="retro-button retro-button-default" onClick={onClose}>
              OK
            </button>
          )}
        </div>
      </dialog>
    </div>
  );
}
