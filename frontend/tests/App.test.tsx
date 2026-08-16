import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { App } from '../src/App';
import { CONFIG_OK, jsonResponse, makeGame } from './factories';

type Handler = (url: string, init?: RequestInit) => Response;

function routeFetch(handler: Handler) {
  const mock = vi.fn(async (url: string, init?: RequestInit) =>
    handler(String(url), init),
  );
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(CONFIG_OK)),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the setup form and states that no Spotify account is connected', async () => {
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /quiz einrichten/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/kein spotify-konto verbunden/i),
    ).toBeInTheDocument();
  });

  it('labels every setup control', async () => {
    render(<App />);

    expect(screen.getByLabelText(/teams/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/anzahl der runden/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/länge des ausschnitts in sekunden/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: /gesamte zeitbegrenzung/i }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /quiz starten/i }),
      ).toBeEnabled(),
    );
  });

  it('creates a game from the form values', async () => {
    const user = userEvent.setup();
    const fetchMock = routeFetch((url) =>
      url.includes('/config')
        ? jsonResponse(CONFIG_OK)
        : jsonResponse(READY_GAME),
    );
    render(<App />);

    await user.clear(screen.getByLabelText(/teams/i));
    await user.type(screen.getByLabelText(/teams/i), 'Reds, Blues');
    await user.click(screen.getByRole('button', { name: /quiz starten/i }));

    await screen.findByRole('heading', { name: /runde 1 von 3/i });
    const createCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/games'),
    );
    expect(JSON.parse(String(createCall?.[1]?.body)).participants).toEqual([
      'Reds',
      'Blues',
    ]);
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

    await user.click(screen.getByRole('button', { name: /quiz starten/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/cannot reach the quiz server/i);
    expect(alert).not.toHaveTextContent(/Failed to fetch/);
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('never shows the answer before reveal', async () => {
    routeFetch((url) => {
      if (url.includes('/config')) return jsonResponse(CONFIG_OK);
      if (url.includes('/round/start')) return jsonResponse(PLAYING_GAME);
      return jsonResponse(READY_GAME);
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /quiz starten/i }));
    await user.click(
      await screen.findByRole('button', { name: /runde starten/i }),
    );

    await screen.findByRole('button', { name: /antwort aufdecken/i });
    expect(screen.getByText(/der titel bleibt verborgen/i)).toBeInTheDocument();
    expect(screen.queryByText(/Track 3/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Artist 3/)).not.toBeInTheDocument();
  });

  it('shows the countdown from the server value, not a local guess', async () => {
    routeFetch((url) => {
      if (url.includes('/config')) return jsonResponse(CONFIG_OK);
      if (url.includes('/round/start'))
        return jsonResponse(
          makeGame({ ...PLAYING_GAME, excerpt_remaining_ms: 7000 }),
        );
      return jsonResponse(READY_GAME);
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /quiz starten/i }));
    await user.click(
      await screen.findByRole('button', { name: /runde starten/i }),
    );

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
        {
          id: 'ev-1',
          participant_id: 'p-a',
          points: 1,
          reason: 'title',
          reversed: false,
        },
      ],
    });
    const fetchMock = routeFetch((url) => {
      if (url.includes('/config')) return jsonResponse(CONFIG_OK);
      if (url.includes('/scores')) return jsonResponse(scored);
      if (url.includes('/round/reveal')) return jsonResponse(REVEALED_GAME);
      if (url.includes('/round/start')) return jsonResponse(PLAYING_GAME);
      return jsonResponse(READY_GAME);
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /quiz starten/i }));
    await user.click(
      await screen.findByRole('button', { name: /runde starten/i }),
    );
    await user.click(
      await screen.findByRole('button', { name: /antwort aufdecken/i }),
    );
    const titleScoreButton = await waitFor(() => {
      const button = screen
        .getAllByRole('button')
        .find((candidate) => candidate.textContent?.includes('+1'));
      if (!button) throw new Error('title score button not rendered');
      return button;
    });
    await user.click(titleScoreButton);

    const scoreCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/scores'),
    );
    expect(JSON.parse(String(scoreCall?.[1]?.body))).toEqual({
      participant_id: 'p-a',
      points: 1,
      reason: 'title',
    });
    const row = within(screen.getByRole('table')).getByRole('row', {
      name: /team a/i,
    });
    expect(row).toHaveTextContent('1');
  });

  it('exposes the scoreboard as a table with row headers', async () => {
    routeFetch((url) =>
      url.includes('/config')
        ? jsonResponse(CONFIG_OK)
        : jsonResponse(READY_GAME),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /quiz starten/i }));

    const table = await screen.findByRole('table', { name: /punktestand/i });
    expect(
      within(table).getByRole('rowheader', { name: 'Team A' }),
    ).toBeInTheDocument();
  });

  it('surfaces backend configuration problems to the host', async () => {
    routeFetch((url) =>
      url.includes('/config')
        ? jsonResponse({
            ...CONFIG_OK,
            problems: ['SPOTIFY_CLIENT_ID is not set'],
          })
        : jsonResponse(READY_GAME),
    );
    render(<App />);

    expect(
      await screen.findByText(/SPOTIFY_CLIENT_ID is not set/),
    ).toBeInTheDocument();
  });

  it('loads, analyses, and selects a real Spotify playlist without rendering track answers', async () => {
    const user = userEvent.setup();
    const fetchMock = routeFetch((url) => {
      if (url.includes('/config')) return jsonResponse(CONFIG_OK);
      if (url.includes('/auth/status')) {
        return jsonResponse({ authenticated: true, configured: true });
      }
      if (url.includes('/playlists/example/analysis')) {
        return jsonResponse({
          total_items: 30,
          eligible_unique_tracks: 28,
          duplicates_removed: 1,
          unavailable_or_unsupported: 1,
          too_short_for_excerpt: 0,
        });
      }
      if (url.endsWith('/playlists')) {
        return jsonResponse([
          {
            id: 'example',
            name: 'Live playlist',
            owner: 'Host',
            total: 30,
            image_url: null,
          },
        ]);
      }
      return jsonResponse(READY_GAME);
    });
    render(<App />);

    await user.click(
      await screen.findByRole('button', {
        name: /spotify-playlist auswählen/i,
      }),
    );
    const option = await screen.findByRole('radio', { name: /live playlist/i });
    await user.click(option);
    expect(
      screen.getByRole('button', { name: /ausgewählte playlist analysieren/i }),
    ).toBeEnabled();
    await user.click(
      screen.getByRole('button', { name: /ausgewählte playlist analysieren/i }),
    );

    expect(await screen.findByText('28')).toBeInTheDocument();
    expect(
      screen.queryByText(/track title|artist name/i),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /diese playlist verwenden/i }),
    );
    expect(screen.getByText('Live playlist')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/analysis')),
    ).toBe(true);
  });

  it('blocks continuation when playlist analysis has no eligible tracks', async () => {
    const user = userEvent.setup();
    routeFetch((url) => {
      if (url.includes('/config')) return jsonResponse(CONFIG_OK);
      if (url.includes('/auth/status')) {
        return jsonResponse({ authenticated: true, configured: true });
      }
      if (url.includes('/analysis')) {
        return jsonResponse({
          total_items: 1,
          eligible_unique_tracks: 0,
          duplicates_removed: 0,
          unavailable_or_unsupported: 1,
          too_short_for_excerpt: 0,
        });
      }
      if (url.endsWith('/playlists')) {
        return jsonResponse([
          { id: 'empty', name: 'Unavailable', owner: 'Host', total: 1 },
        ]);
      }
      return jsonResponse(READY_GAME);
    });
    render(<App />);

    await user.click(
      await screen.findByRole('button', {
        name: /spotify-playlist auswählen/i,
      }),
    );
    await user.click(
      await screen.findByRole('radio', { name: /unavailable/i }),
    );
    await user.click(
      screen.getByRole('button', { name: /ausgewählte playlist analysieren/i }),
    );

    expect(
      await screen.findByText(/keine geeigneten titel/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /diese playlist verwenden/i }),
    ).toBeDisabled();
  });

  it('logs out through the backend and clears the connected UI state', async () => {
    const user = userEvent.setup();
    let loggedOut = false;
    const fetchMock = routeFetch((url, init) => {
      if (url.includes('/config')) return jsonResponse(CONFIG_OK);
      if (url.includes('/auth/status')) {
        return jsonResponse({ authenticated: !loggedOut, configured: true });
      }
      if (url.includes('/auth/logout')) {
        loggedOut = true;
        expect(init?.method).toBe('POST');
        return jsonResponse({ authenticated: false });
      }
      return jsonResponse(READY_GAME);
    });
    render(<App />);

    expect(
      await screen.findByText(/spotify ist verbunden/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /von spotify abmelden/i }),
    );

    expect(
      await screen.findByText(/spotify-konto getrennt/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/kein spotify-konto verbunden/i),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('/auth/logout'),
      ),
    ).toBe(true);
  });

  it('recognises the backend auth_callback success redirect', async () => {
    window.history.pushState({}, '', '/frontend/?auth_callback=success');
    routeFetch((url) => {
      if (url.includes('/config')) return jsonResponse(CONFIG_OK);
      if (url.includes('/auth/status')) {
        return jsonResponse({ authenticated: true, configured: true });
      }
      return jsonResponse(READY_GAME);
    });

    render(<App />);

    expect(
      await screen.findByText('Spotify-Konto verbunden.'),
    ).toBeInTheDocument();
    expect(window.location.search).toBe('');
    window.history.replaceState({}, '', '/frontend/');
  });

  it('renders a read-only player display without exposing the answer early', () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify(PLAYING_GAME)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    });
    window.history.pushState({}, '', '/frontend/?view=display');

    render(<App />);

    expect(
      screen.getByRole('heading', {
        name: 'Back to the 90s – Amt 16 Musikquiz',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/warte auf den quizmaster|der titel bleibt verborgen/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/track 3|artist 3/i)).not.toBeInTheDocument();

    window.history.replaceState({}, '', '/frontend/');
  });

  it('every interactive control is reachable and has an accessible name', async () => {
    routeFetch((url) =>
      url.includes('/config')
        ? jsonResponse(CONFIG_OK)
        : jsonResponse(READY_GAME),
    );
    render(<App />);

    await waitFor(() =>
      expect(screen.getAllByRole('button').length).toBeGreaterThan(0),
    );
    for (const control of [
      ...screen.getAllByRole('button'),
      ...screen.getAllByRole('link'),
    ]) {
      expect(control).toHaveAccessibleName();
    }
  });
});
