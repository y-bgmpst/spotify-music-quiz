import { render, screen } from '@testing-library/react';
import { vi, test, expect } from 'vitest';
import { App } from '../src/App';

vi.mock('../src/api/client', () => ({ api: { create: vi.fn() } }));

test('starts with no answer metadata in the DOM', () => {
  render(<App />);
  expect(screen.queryByText(/Track 1/)).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /create demo game/i }),
  ).toBeInTheDocument();
});
