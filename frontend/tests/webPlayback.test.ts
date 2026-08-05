import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaybackError, SpotifyWebPlayback } from '../src/spotify/webPlayback';

type Listener = (payload: unknown) => void;

interface FakeSdkOptions {
  readyDevice?: string;
  failWith?: string;
  emitEvent?: boolean;
  requestToken?: boolean;
}

function fakeSdk(options: FakeSdkOptions = {}) {
  let oauthCallback: ((token: string) => void) | undefined;
  const player = {
    listeners: new Map<string, Listener>(),
    paused: 0,
    resumed: 0,
    disconnected: 0,
    connect: vi.fn(async () => {
      if (options.requestToken) oauthCallback?.(() => undefined as never);
      if (options.emitEvent === false) return true;
      const event = options.failWith ?? 'ready';
      const payload = options.failWith
        ? {}
        : { device_id: options.readyDevice ?? 'device-1' };
      queueMicrotask(() => player.listeners.get(event)?.(payload));
      return !options.failWith;
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
    Player: vi.fn(function Player(optionsArg: {
      getOAuthToken: (cb: (token: string) => void) => void;
    }) {
      oauthCallback = optionsArg.getOAuthToken;
      return player;
    }),
  } as unknown as never;
  return { sdk, player };
}

function make(
  options: FakeSdkOptions = {},
  fetchImpl?: typeof fetch,
  getToken: () => Promise<string> = async () => 'token-abc',
  connectTimeoutMs = 15_000,
) {
  const { sdk, player } = fakeSdk(options);
  const playback = new SpotifyWebPlayback({
    getToken,
    loadSdk: async () => sdk,
    fetchImpl:
      fetchImpl ??
      (vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch),
    connectTimeoutMs,
  });
  return { playback, player };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SpotifyWebPlayback', () => {
  it('connects a device and asks Spotify to play the requested uri', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const { playback } = make({}, fetchImpl as unknown as typeof fetch);

    await playback.start({ uri: 'spotify:track:xyz', position_ms: 4200 });

    expect(playback.device).toBe('device-1');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('device_id=device-1');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({
      uris: ['spotify:track:xyz'],
      position_ms: 4200,
    });
  });

  it('rejects an invalid playback target before connecting', async () => {
    const { playback, player } = make();

    await expect(playback.start({ uri: 'unknown', position_ms: 0 })).rejects.toMatchObject({
      kind: 'playback',
    });
    expect(player.connect).not.toHaveBeenCalled();
  });

  it('reports a Premium requirement instead of a generic failure', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 403 }));
    const { playback } = make({}, fetchImpl as unknown as typeof fetch);

    await expect(
      playback.start({ uri: 'spotify:track:a', position_ms: 0 }),
    ).rejects.toMatchObject({ kind: 'premium' });
  });

  it('surfaces an account error raised by the SDK during connect', async () => {
    const { playback } = make({ failWith: 'account_error' });

    await expect(
      playback.start({ uri: 'spotify:track:a', position_ms: 0 }),
    ).rejects.toMatchObject({ kind: 'premium' });
  });

  it('times out when the SDK never reports a ready device', async () => {
    vi.useFakeTimers();
    const { playback, player } = make({ emitEvent: false }, undefined, undefined, 1000);
    const start = playback.start({ uri: 'spotify:track:a', position_ms: 0 });

    await vi.advanceTimersByTimeAsync(1000);

    await expect(start).rejects.toMatchObject({ kind: 'device' });
    expect(player.disconnect).toHaveBeenCalledTimes(1);
  });

  it('surfaces a token callback failure instead of hanging', async () => {
    const { playback, player } = make(
      { requestToken: true, emitEvent: false },
      undefined,
      async () => Promise.reject(new Error('expired')),
      5000,
    );

    await expect(
      playback.start({ uri: 'spotify:track:a', position_ms: 0 }),
    ).rejects.toMatchObject({ kind: 'auth' });
    expect(player.disconnect).toHaveBeenCalledTimes(1);
  });

  it('pauses, resumes and tears the device down', async () => {
    const { playback, player } = make();

    await playback.start({ uri: 'spotify:track:a', position_ms: 0 });
    await playback.pause();
    await playback.resume();
    await playback.stop();

    expect(player.resumed).toBe(1);
    expect(player.paused).toBe(2);
    expect(player.disconnected).toBe(1);
    expect(playback.device).toBeUndefined();
  });

  it('does nothing when stopped before it ever connected', async () => {
    const { playback, player } = make();

    await playback.stop();

    expect(player.disconnect).not.toHaveBeenCalled();
  });
});
