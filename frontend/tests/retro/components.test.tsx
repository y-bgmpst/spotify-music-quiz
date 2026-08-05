import { useRef, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MenuBar, type Menu } from '../../src/retro/MenuBar';
import { RetroDialog } from '../../src/retro/RetroDialog';

function buildMenus(onSelect = vi.fn()): Menu[] {
  return [
    {
      label: 'File',
      items: [
        { label: 'New game', onSelect, hint: 'Ctrl+N' },
        { label: 'Exit', onSelect },
      ],
    },
    {
      label: 'Audio',
      items: [{ label: 'Intro sound', checked: true, onSelect }],
    },
  ];
}

describe('MenuBar', () => {
  it('opens a menu on click and exposes the expanded state', async () => {
    const user = userEvent.setup();
    render(<MenuBar menus={buildMenus()} />);
    const trigger = screen.getByRole('button', { name: 'File' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'File' })).toBeInTheDocument();
  });

  it('runs the selected item and closes the menu', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<MenuBar menus={buildMenus(onSelect)} />);

    await user.click(screen.getByRole('button', { name: 'File' }));
    await user.click(screen.getByRole('menuitem', { name: /New game/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens with ArrowDown and closes with Escape, returning focus', async () => {
    const user = userEvent.setup();
    render(<MenuBar menus={buildMenus()} />);
    const trigger = screen.getByRole('button', { name: 'File' });

    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menu', { name: 'File' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('moves between top-level menus with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<MenuBar menus={buildMenus()} />);
    screen.getByRole('button', { name: 'File' }).focus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Audio' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('button', { name: 'File' })).toHaveFocus();
  });

  it('exposes checkable entries as menuitemcheckbox with their state', async () => {
    const user = userEvent.setup();
    render(<MenuBar menus={buildMenus()} />);
    await user.click(screen.getByRole('button', { name: 'Audio' }));
    expect(screen.getByRole('menuitemcheckbox', { name: /Intro sound/ })).toBeChecked();
  });

  it('does not fire disabled entries', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <MenuBar menus={[{ label: 'File', items: [{ label: 'Save', onSelect, disabled: true }] }]} />,
    );
    await user.click(screen.getByRole('button', { name: 'File' }));
    await user.click(screen.getByRole('menuitem', { name: /Save/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

function DialogHarness() {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open settings
      </button>
      <RetroDialog
        title="Audio settings"
        open={open}
        onClose={() => setOpen(false)}
        initialFocusRef={inputRef}
      >
        <label htmlFor="vol">Volume</label>
        <input id="vol" ref={inputRef} type="range" />
      </RetroDialog>
    </>
  );
}

describe('RetroDialog', () => {
  it('renders nothing while closed', () => {
    render(<DialogHarness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens as a modal, labelled by its title', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Audio settings' })).toBeInTheDocument();
  });

  it('gives focus to the requested element', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await waitFor(() => expect(screen.getByLabelText('Volume')).toHaveFocus());
  });

  it('closes on Escape and returns focus to the opener', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const opener = screen.getByRole('button', { name: 'Open settings' });
    await user.click(opener);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('closes through the titlebar close button', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.click(screen.getByRole('button', { name: 'Close Audio settings' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('renders a default OK action when no footer is given', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });
});
