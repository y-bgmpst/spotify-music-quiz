import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, api, request, toDisplayMessage } from '../src/api/client';
import { jsonResponse, makeGame } from './factories';

describe('api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const fetchMock = () =>
    globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

  it('returns parsed JSON on success', async () => {
    const game = makeGame();
    fetchMock().mockResolvedValue(jsonResponse(game));

    await expect(api.get('game-1')).resolves.toEqual(game);
  });

  it('sends JSON bodies with a content-type header', async () => {
    fetchMock().mockResolvedValue(jsonResponse(makeGame()));

    await api.create({ rounds: 3 });

    const [, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(init.body).toBe(JSON.stringify({ rounds: 3 }));
  });

  it('surfaces the backend error message from the error envelope', async () => {
    fetchMock().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'game_not_found',
            message: 'That game does not exist.',
          },
        },
        404,
      ),
    );

    const error = await api.get('missing').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('http');
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).code).toBe('game_not_found');
    expect((error as ApiError).message).toBe('That game does not exist.');
  });

  it('falls back to a safe message when the error body is not JSON', async () => {
    fetchMock().mockResolvedValue(
      new Response('<html>500</html>', { status: 500 }),
    );

    const error = (await api.get('x').catch((e: unknown) => e)) as ApiError;

    expect(error.message).toBe(
      'The quiz server had a problem. Please try again.',
    );
    expect(error.message).not.toContain('<html>');
  });

  it('reports an unreachable backend as a network error', async () => {
    fetchMock().mockRejectedValue(new TypeError('Failed to fetch'));

    const error = (await api.get('x').catch((e: unknown) => e)) as ApiError;

    expect(error.kind).toBe('network');
    expect(error.message).toBe(
      'Cannot reach the quiz server. Is the backend running?',
    );
  });

  it('aborts a request that exceeds the timeout', async () => {
    fetchMock().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );

    const pending = request('/slow', { timeoutMs: 20 }).catch(
      (e: unknown) => e,
    );
    const error = (await pending) as ApiError;

    expect(error.kind).toBe('timeout');
    expect(error.message).toBe('The quiz server did not respond in time.');
  });

  it('rejects a malformed success body instead of returning undefined', async () => {
    fetchMock().mockResolvedValue(new Response('not json', { status: 200 }));

    const error = (await api.get('x').catch((e: unknown) => e)) as ApiError;

    expect(error.kind).toBe('malformed');
  });

  it('never exposes a raw exception to the UI', () => {
    expect(toDisplayMessage(new Error('stack trace leak'))).toBe(
      'Something went wrong. Please try again.',
    );
    expect(toDisplayMessage(new ApiError('http', 'Safe message'))).toBe(
      'Safe message',
    );
  });

  it('builds score endpoints against the game id', async () => {
    // A Response body can only be read once, so build a fresh one per call.
    fetchMock().mockImplementation(async () => jsonResponse(makeGame()));

    await api.awardScore('game-1', {
      participant_id: 'p-a',
      points: 1,
      reason: 'title',
    });
    await api.reverseScore('game-1', 'event-9');

    const urls = fetchMock().mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toContain('/games/game-1/scores');
    expect(urls[1]).toContain('/games/game-1/scores/event-9/reverse');
  });
});
