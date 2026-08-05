import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { App } from '../src/App';
import { CONFIG_OK, jsonResponse, makeGame } from './factories';

type Handler = (url: string, init?: RequestInit) => Response;

function routeFetch(handler: Handler) {
  const mock = vi.fn(async (url: string, init?: RequestInit) => handler(String(url), init));
  vi.stubGlobal('fetch', mock);
  return mock;
}

const READY_GAME = makeGame();
const PLAYING_GAME = makeGame({
  status: 'playing',
  excerpt_remaining_ms: 10_000,
  excerpt_deadline_ms: Date.now() + 10_000,
});
const REVEALED_GAME = makeGame({
  status: 'revealed',
  answer: { title: 'Track 3', artists: ['Artist 3'], album: 'Fake Album' },
});

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(CONFIG_OK)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the setup form and states that no Spotify account is connected', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: /set up the quiz/i })).toBeInTheDocument();
    expect(screen.getByText(/no spotify account is connected/i)).toBeInTheDocument();
  });

  it('labels every setup control', async () => {
    render(<App />);

    expect(screen.getByLabelText(/teams/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/number of rounds/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/excerpt length in seconds/i)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /overall time limit/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /start quiz/i })).toBeEnabled());
  });

  it('creates a game from the form values', async () => {
    const user = userEvent.setup();
    const fetchMock = routeFetch(url =>
      url.includes('/config') ? jsonResponse(CONFIG_OK) : jsonResponse(READY_GAME),
    );
    render(<App />);

    await user.clear(screen.getByLabelText(/teams/i));
    await user.type(screen.getByLabelText(/teams/i), 'Reds, Blues');
    await user.click(screen.getByRole('button', { name: /start quiz/i }));

    await screen.findByRole('heading', { name: /round 1 of 3/i });
    const createCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/games'));
    expect(JSON.parse(String(createCall?.[1]?.body)).participants).toEqual(['Reds', 'Blues']);
  });

  it('renders a friendly error and focuses it when the backend is unreachable', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/config')) return jsonResponse(CONFIG_OK);
        throw new TypeError('Failed to fetch');
      }),
    );
    render(<App />);

    await user.click(screen.getByRole('button', { name: /start quiz/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/cannot reach the quiz server/i);
    expect(alert).not.toHaveTextContent(/Failed to fetch/);
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('never shows the answer before reveal', async () => {
    routeFetch(url => {
      if (url.includes('/config')) return jsonResponse(CONFIG_OK);
      if (url.includes('/round/start')) return jsonResponse(PLAYING_GAME);
      return jsonResponse(READY_GAME);
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /start quiz/i }));
    await user.click(await screen.findByRole('button', { name: /start round/i }));

    await screen.findByRole('button', { name: /reveal answer/i });
    expect(screen.getByText(/the track is hidden until you reveal it/i)).toBeInTheDocument();
    expect(screen.queryByText(/Track 3/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Artist 3/)).not.toBeInTheDocument();
  });

  it('shows the countdown from the server value, not a local guess', async () => {
    routeFetch(url => {
      if (url.includes('/config')) return jsonResponse(CONFIG_OK);
      if (url.includes('/round/start'))
        return jsonResponse(makeGame({ ...PLAYING_GAME, excerpt_remaining_ms: 7000 }));
      return jsonResponse(READY_GAME);
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /start quiz/i }));
    await user.click(await screen.findByRole('button', { name: /start round/i }));

    expect(await screen.findByText('0:07')).toBeInTheDocument();
  });

  it('awards points through the API and reflects the returned score', async () => {
    const scored = makeGame({
      ...REVEALED_GAME,
      participants: [
        { id: 'p-a', name: 'Team A', score: 1 },
        { id: 'p-b', name: 'Team B', score: 0 },
      ],
      score_events: [
        { id: 'ev-1', participant_id: 'p-a', points: 1, reason: 'title', reversed: false },
      ],
    });
    const fetchMock = routeFetch(url => {
      if (url.includes('/config')) return jsonResponse(CONFIG_OK);
      if (url.includes('/scores')) return jsonResponse(scored);
      if (url.includes('/round/reveal')) return jsonResponse(REVEALED_GAME);
      if (url.includes('/round/start')) return jsonResponse(PLAYING_GAME);
      return jsonResponse(READY_GAME);
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /start quiz/i }));
    await user.click(await screen.findByRole('button', { name: /start round/i }));
    await user.click(await screen.findByRole('button', { name: /reveal answer/i }));
    await user.click(
      await screen.findByRole('button', { name: /award one point to team a for the title/i }),
    );

    const scoreCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/scores'));
    expect(JSON.parse(String(scoreCall?.[1]?.body))).toEqual({
      participant_id: 'p-a',
      points: 1,
      reason: 'title',
    });
    const row = within(screen.getByRole('table')).getByRole('row', { name: /team a/i });
    expect(row).toHaveTextContent('1');
  });

  it('exposes the scoreboard as a table with row headers', async () => {
    routeFetch(url => (url.includes('/config') ? jsonResponse(CONFIG_OK) : jsonResponse(READY_GAME)));
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /start quiz/i }));

    const table = await screen.findByRole('table', { name: /scoreboard/i });
    expect(within(table).getByRole('rowheader', { name: 'Team A' })).toBeInTheDocument();
  });

  it('surfaces backend configuration problems to the host', async () => {
    routeFetch(url =>
      url.includes('/config')
        ? jsonResponse({ ...CONFIG_OK, problems: ['SPOTIFY_CLIENT_ID is not set'] })
        : jsonResponse(READY_GAME),
    );
    render(<App />);

    expect(await screen.findByText(/SPOTIFY_CLIENT_ID is not set/)).toBeInTheDocument();
  });

  it('every interactive control is reachable and has an accessible name', async () => {
    routeFetch(url => (url.includes('/config') ? jsonResponse(CONFIG_OK) : jsonResponse(READY_GAME)));
    render(<App />);

    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0));
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('link')]) {
      expect(control).toHaveAccessibleName();
    }
  });
});
