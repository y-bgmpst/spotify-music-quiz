import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DesktopIcons, Taskbar } from '../../src/retro/Desktop';

describe('DesktopIcons', () => {
  it('opens a shortcut from the keyboard, not only by double-click', async () => {
    const onOpen = vi.fn();
    render(
      <DesktopIcons
        shortcuts={[{ id: 'quiz', label: 'Music Quiz', icon: 'app', onOpen }]}
      />,
    );

    await userEvent.tab();
    await userEvent.keyboard('{Enter}');

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('list', { name: /desktop shortcuts/i }),
    ).toBeInTheDocument();
  });
});

function renderTaskbar(overrides: Partial<Parameters<typeof Taskbar>[0]> = {}) {
  const props = {
    windowTitle: 'Spotify Music Quiz',
    minimized: false,
    onToggleWindow: vi.fn(),
    startItems: [{ label: 'About', icon: 'app' as const, onSelect: vi.fn() }],
    clock: '20:15',
    ...overrides,
  };
  render(<Taskbar {...props} />);
  return props;
}

describe('Taskbar', () => {
  it('shows the running window and the tray clock', () => {
    renderTaskbar();

    expect(
      screen.getByRole('button', { name: /spotify music quiz/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('20:15')).toBeInTheDocument();
  });

  it('marks the task button as not pressed while the window is minimised', () => {
    renderTaskbar({ minimized: true });

    expect(
      screen.getByRole('button', { name: /spotify music quiz/i }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('restores the window from the task button', async () => {
    const props = renderTaskbar({ minimized: true });

    await userEvent.click(
      screen.getByRole('button', { name: /spotify music quiz/i }),
    );

    expect(props.onToggleWindow).toHaveBeenCalledTimes(1);
  });

  it('opens the Start menu and runs an entry', async () => {
    const onSelect = vi.fn();
    renderTaskbar({ startItems: [{ label: 'About', icon: 'app', onSelect }] });
    const start = screen.getByRole('button', { name: /start/i });

    await userEvent.click(start);
    expect(start).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(screen.getByRole('menuitem', { name: 'About' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(start).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the Start menu on Escape', async () => {
    renderTaskbar();
    const start = screen.getByRole('button', { name: /start/i });

    await userEvent.click(start);
    await userEvent.keyboard('{Escape}');

    expect(start).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
