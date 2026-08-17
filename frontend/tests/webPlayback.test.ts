import { describe, expect, it, vi } from 'vitest';
import { PlaybackError, SpotifyWebPlayback } from '../src/spotify/webPlayback';

type Listener = (payload: never) => void;

/** Minimal stand-in for the Spotify SDK global. */
function createSdkPlayer() {
  const listeners = new Map<string, Listener>();
  const player = {
    connect: vi.fn(async () => true),
    activateElement: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    pause: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    setVolume: vi.fn(async () => undefined),
    addListener: vi.fn((event: string, callback: Listener) => {
      listeners.set(event, callback);
      return true;
    }),
    emit(event: string, payload: unknown = {}) {
      listeners.get(event)?.(payload as never);
    },
  };
  return player;
}

function createPlayback(
  options: {
    onError?: (message: string) => void;
    fetchImpl?: typeof fetch;
  } = {},
) {
  const sdkPlayer = createSdkPlayer();
  const Player = vi.fn(function Player() {
    return sdkPlayer;
  });
  const loadSdk = vi.fn(async () => ({ Player }));
  const fetchImpl =
    options.fetchImpl ??
    (vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch);
  const playback = new SpotifyWebPlayback({
    getToken: vi.fn(async () => 'test-token'),
    loadSdk,
    fetchImpl,
    onError: options.onError ?? vi.fn(),
    connectTimeoutMs: 100,
  });
  return {
    playback,
    sdkPlayer,
    fetchImpl: fetchImpl as ReturnType<typeof vi.fn>,
  };
}

const TARGET = { uri: 'spotify:track:test', position_ms: 0 };

async function readyNow(
  sdkPlayer: ReturnType<typeof createSdkPlayer>,
  deviceId = 'device-test',
) {
  await Promise.resolve();
  await Promise.resolve();
  sdkPlayer.emit('ready', { device_id: deviceId });
}

describe('SpotifyWebPlayback', () => {
  it('connects a device and asks Spotify to play the requested uri', async () => {
    const { playback, sdkPlayer, fetchImpl } = createPlayback();

    const connection = playback.start({
      uri: 'spotify:track:xyz',
      position_ms: 4200,
    });
    await readyNow(sdkPlayer, 'device-1');
    await connection;

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

  it('tests the browser player connection without starting playback', async () => {
    const { playback, sdkPlayer, fetchImpl } = createPlayback();

    const connection = playback.testConnection();
    await readyNow(sdkPlayer, 'device-1');
    await connection;

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sdkPlayer.connect).toHaveBeenCalledTimes(1);
    expect(sdkPlayer.activateElement).toHaveBeenCalledTimes(1);
  });

  it('reports a Premium requirement instead of a generic failure', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 403 }));
    const { playback, sdkPlayer } = createPlayback({ fetchImpl });

    const connection = playback.start(TARGET);
    await readyNow(sdkPlayer);

    await expect(connection).rejects.toMatchObject({ kind: 'premium' });
  });

  it('reports an expired session as an auth problem', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }));
    const { playback, sdkPlayer } = createPlayback({ fetchImpl });

    const connection = playback.start(TARGET);
    await readyNow(sdkPlayer);

    await expect(connection).rejects.toBeInstanceOf(PlaybackError);
  });

  it('surfaces an account error raised by the SDK during connect', async () => {
    const { playback, sdkPlayer } = createPlayback();

    const connection = playback.start(TARGET);
    await Promise.resolve();
    await Promise.resolve();
    sdkPlayer.emit('account_error');

    await expect(connection).rejects.toMatchObject({ kind: 'premium' });
  });

  it('pauses, resumes and tears the device down', async () => {
    const { playback, sdkPlayer } = createPlayback();

    const connection = playback.start(TARGET);
    await readyNow(sdkPlayer);
    await connection;
    await playback.pause();
    await playback.resume();
    await playback.stop();

    expect(sdkPlayer.resume).toHaveBeenCalledTimes(1);
    expect(sdkPlayer.pause).toHaveBeenCalledTimes(2); // one explicit pause, one on teardown
    expect(sdkPlayer.disconnect).toHaveBeenCalledTimes(1);
    expect(playback.device).toBeUndefined();
  });

  it('does nothing when stopped before it ever connected', async () => {
    const { playback, sdkPlayer } = createPlayback();

    await playback.stop();

    expect(sdkPlayer.disconnect).not.toHaveBeenCalled();
  });

  it('not_ready invalidates the device and reports a recoverable error', async () => {
    const onError = vi.fn();
    const { playback, sdkPlayer } = createPlayback({ onError });

    const connection = playback.start(TARGET);
    await readyNow(sdkPlayer);
    await expect(connection).resolves.toBeUndefined();

    sdkPlayer.emit('not_ready');

    expect(playback.device).toBeUndefined();
    expect(onError).toHaveBeenCalledWith(
      'Das Spotify-Wiedergabegerät ist nicht verfügbar.',
    );
  });

  it('playback_error reaches the application as a sanitized error', async () => {
    const onError = vi.fn();
    const { playback, sdkPlayer } = createPlayback({ onError });

    const connection = playback.start(TARGET);
    await readyNow(sdkPlayer);
    await expect(connection).resolves.toBeUndefined();

    sdkPlayer.emit('playback_error', { message: 'private SDK payload' });

    expect(onError).toHaveBeenCalledWith('Spotify-Wiedergabe fehlgeschlagen.');
  });
});
