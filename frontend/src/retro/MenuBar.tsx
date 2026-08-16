import { useCallback, useEffect, useId, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  onSelect?: () => void;
  /** Rendered but not operable, with the reason exposed to assistive tech. */
  disabled?: boolean;
  /** Shown right-aligned, e.g. a keyboard shortcut. */
  hint?: string;
  /** Checkable entries expose their state instead of just looking different. */
  checked?: boolean;
}

export interface Menu {
  label: string;
  items: MenuItem[];
}

interface MenuBarProps {
  menus: Menu[];
}

/**
 * Classic menu bar with full keyboard support.
 *
 * Roving focus across the top-level buttons, Arrow keys inside an open menu,
 * Home/End, Escape to close and return focus, and click-outside to dismiss.
 */
export function MenuBar({ menus }: MenuBarProps) {
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const close = useCallback((restoreFocus = true) => {
    setOpenIndex((current) => {
      if (current !== null && restoreFocus) {
        triggerRefs.current[current]?.focus();
      }
      return null;
    });
  }, []);

  useEffect(() => {
    if (openIndex === null) return;
    itemRefs.current = [];
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [openIndex, close]);

  useEffect(() => {
    if (openIndex === null) return;
    // Focus the first entry so the menu is immediately keyboard-operable.
    const id = window.requestAnimationFrame(() => itemRefs.current[0]?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [openIndex]);

  function focusTrigger(index: number) {
    const next = (index + menus.length) % menus.length;
    triggerRefs.current[next]?.focus();
    setOpenIndex((current) => (current === null ? null : next));
  }

  function onTriggerKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusTrigger(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusTrigger(index - 1);
    } else if (
      event.key === 'ArrowDown' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      setOpenIndex(index);
    } else if (event.key === 'Escape') {
      close();
    }
  }

  function onItemKeyDown(
    event: React.KeyboardEvent,
    itemIndex: number,
    menuIndex: number,
  ) {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(itemIndex + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(itemIndex - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setOpenIndex((menuIndex + 1) % menus.length);
      triggerRefs.current[(menuIndex + 1) % menus.length]?.focus();
      setOpenIndex((menuIndex + 1) % menus.length);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const previous = (menuIndex - 1 + menus.length) % menus.length;
      setOpenIndex(previous);
    }
  }

  return (
    <div className="retro-menubar" ref={rootRef}>
      {menus.map((menu, menuIndex) => {
        const menuId = `${baseId}-menu-${menuIndex}`;
        const open = openIndex === menuIndex;
        return (
          <div className="retro-menu" key={menu.label}>
            <button
              type="button"
              className="retro-menu-trigger"
              ref={(element) => {
                triggerRefs.current[menuIndex] = element;
              }}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={open ? menuId : undefined}
              onClick={() => setOpenIndex(open ? null : menuIndex)}
              onKeyDown={(event) => onTriggerKeyDown(event, menuIndex)}
            >
              {menu.label}
            </button>
            {open && (
              <ul
                className="retro-menu-list"
                id={menuId}
                role="menu"
                aria-label={menu.label}
              >
                {menu.items.map((item, itemIndex) => (
                  <li key={item.label} role="none">
                    <button
                      type="button"
                      role={
                        item.checked === undefined
                          ? 'menuitem'
                          : 'menuitemcheckbox'
                      }
                      aria-checked={item.checked}
                      aria-disabled={item.disabled || undefined}
                      className="retro-menu-item"
                      ref={(element) => {
                        itemRefs.current[itemIndex] = element;
                      }}
                      onKeyDown={(event) =>
                        onItemKeyDown(event, itemIndex, menuIndex)
                      }
                      onClick={() => {
                        if (item.disabled) return;
                        close();
                        item.onSelect?.();
                      }}
                    >
                      <span className="retro-menu-item-label">
                        {item.label}
                      </span>
                      {item.hint && (
                        <span
                          className="retro-menu-item-hint"
                          aria-hidden="true"
                        >
                          {item.hint}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
