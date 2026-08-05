import { describe, expect, it, vi } from 'vitest';
import { PlaybackError, SpotifyWebPlayback } from '../src/spotify/webPlayback';

type Listener = (payload: unknown) => void;

/** Minimal stand-in for the Spotify SDK global. */
function fakeSdk(overrides: { readyDevice?: string; failWith?: string } = {}) {
  const player = {
    listeners: new Map<string, Listener>(),
    paused: 0,
    resumed: 0,
    disconnected: 0,
    connect: vi.fn(async () => {
      const event = overrides.failWith ?? 'ready';
      const payload = overrides.failWith
        ? {}
        : { device_id: overrides.readyDevice ?? 'device-1' };
      queueMicrotask(() => player.listeners.get(event)?.(payload));
      return !overrides.failWith;
    }),
    disconnect: vi.fn(() => {
      player.disconnected += 1;
    }),
    pause: vi.fn(async () => {
      player.paused += 1;
    }),
    resume: vi.fn(async () => {
      player.resumed += 1;
    }),
    setVolume: vi.fn(async () => undefined),
    addListener: vi.fn((event: string, cb: Listener) => {
      player.listeners.set(event, cb);
      return true;
    }),
  };
  const sdk = {
    Player: vi.fn(function Player() {
      return player;
    }),
  } as unknown as never;
  return { sdk, player };
}

function make(
  overrides: Parameters<typeof fakeSdk>[0] = {},
  fetchImpl?: typeof fetch,
) {
  const { sdk, player } = fakeSdk(overrides);
  const playback = new SpotifyWebPlayback({
    getToken: async () => 'token-abc',
    loadSdk: async () => sdk,
    fetchImpl:
      fetchImpl ??
      (vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch),
  });
  return { playback, player };
}

describe('SpotifyWebPlayback', () => {
  it('connects a device and asks Spotify to play the requested uri', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const { playback } = make({}, fetchImpl as unknown as typeof fetch);

    await playback.start({ uri: 'spotify:track:xyz', position_ms: 4200 });

    expect(playback.device).toBe('device-1');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain('device_id=device-1');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({
      uris: ['spotify:track:xyz'],
      position_ms: 4200,
    });
  });

  it('reports a Premium requirement instead of a generic failure', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 403 }));
    const { playback } = make({}, fetchImpl as unknown as typeof fetch);

    await expect(
      playback.start({ uri: 'spotify:track:a', position_ms: 0 }),
    ).rejects.toMatchObject({
      kind: 'premium',
    });
  });

  it('reports an expired session as an auth problem', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }));
    const { playback } = make({}, fetchImpl as unknown as typeof fetch);

    await expect(
      playback.start({ uri: 'spotify:track:a', position_ms: 0 }),
    ).rejects.toBeInstanceOf(PlaybackError);
  });

  it('surfaces an account error raised by the SDK during connect', async () => {
    const { playback } = make({ failWith: 'account_error' });

    await expect(
      playback.start({ uri: 'spotify:track:a', position_ms: 0 }),
    ).rejects.toMatchObject({
      kind: 'premium',
    });
  });

  it('pauses, resumes and tears the device down', async () => {
    const { playback, player } = make();

    await playback.start({ uri: 'spotify:track:a', position_ms: 0 });
    await playback.pause();
    await playback.resume();
    await playback.stop();

    expect(player.resumed).toBe(1);
    expect(player.paused).toBe(2); // one explicit pause, one on teardown
    expect(player.disconnected).toBe(1);
    expect(playback.device).toBeUndefined();
  });

  it('does nothing when stopped before it ever connected', async () => {
    const { playback, player } = make();

    await playback.stop();

    expect(player.disconnect).not.toHaveBeenCalled();
  });
});
