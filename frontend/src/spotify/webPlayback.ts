/**
 * Spotify Web Playback SDK adapter.
 *
 * This is the real audio path. It loads the SDK on demand, registers a browser
 * device with a token fetched from the backend, and drives it through the same
 * `PlaybackPort` the stub implements, so the game logic does not change.
 */

import type { PlaybackPort, PlaybackTarget } from './player';

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
const PLAYER_NAME = 'Spotify Music Quiz';
const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;

export class PlaybackError extends Error {
  readonly kind: 'unsupported' | 'auth' | 'premium' | 'device' | 'playback';

  constructor(kind: PlaybackError['kind'], message: string) {
    super(message);
    this.name = 'PlaybackError';
    this.kind = kind;
  }
}

interface SpotifyPlayerLike {
  connect(): Promise<boolean>;
  disconnect(): void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  setVolume(value: number): Promise<void>;
  addListener(event: string, cb: (payload: never) => void): boolean;
}

interface SpotifyGlobal {
  Player: new (options: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume: number;
  }) => SpotifyPlayerLike;
}

declare global {
  interface Window {
    Spotify?: SpotifyGlobal;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

let sdkPromise: Promise<SpotifyGlobal> | undefined;

export function loadSpotifySdk(timeoutMs = DEFAULT_CONNECT_TIMEOUT_MS): Promise<SpotifyGlobal> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new PlaybackError('unsupported', 'Playback needs a browser window.'));
  }
  if (window.Spotify) return Promise.resolve(window.Spotify);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<SpotifyGlobal>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      sdkPromise = undefined;
      reject(new PlaybackError('unsupported', 'The Spotify player could not be loaded.'));
    }, timeoutMs);

    window.onSpotifyWebPlaybackSDKReady = () => {
      window.clearTimeout(timer);
      if (window.Spotify) resolve(window.Spotify);
      else reject(new PlaybackError('unsupported', 'The Spotify player could not be loaded.'));
    };

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    if (existing) return;
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      sdkPromise = undefined;
      reject(new PlaybackError('unsupported', 'The Spotify player script could not be loaded.'));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export interface SpotifyPlaybackOptions {
  getToken: () => Promise<string>;
  loadSdk?: (timeoutMs?: number) => Promise<SpotifyGlobal>;
  fetchImpl?: typeof fetch;
  volume?: number;
  connectTimeoutMs?: number;
}

function playbackFailure(kind: PlaybackError['kind'], message: string): PlaybackError {
  return new PlaybackError(kind, message);
}

function waitForDevice(
  player: SpotifyPlayerLike,
  tokenFailure: Promise<never>,
  timeoutMs: number,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      operation();
    };
    const fail = (error: PlaybackError) => finish(() => reject(error));
    const timer = window.setTimeout(() => {
      fail(playbackFailure('device', 'The Spotify player did not become ready in time.'));
    }, timeoutMs);

    player.addListener('ready', (payload: never) => {
      const deviceId = (payload as unknown as { device_id?: string }).device_id;
      if (!deviceId) {
        fail(playbackFailure('device', 'Spotify did not provide a playback device.'));
        return;
      }
      finish(() => resolve(deviceId));
    });
    player.addListener('authentication_error', () => {
      fail(playbackFailure('auth', 'Spotify rejected the session. Sign in again.'));
    });
    player.addListener('account_error', () => {
      fail(playbackFailure('premium', 'Spotify playback requires a Premium account.'));
    });
    player.addListener('initialization_error', () => {
      fail(playbackFailure('unsupported', 'This browser cannot play Spotify audio.'));
    });

    void tokenFailure.catch((error: PlaybackError) => fail(error));
    void player
      .connect()
      .then(connected => {
        if (!connected) fail(playbackFailure('device', 'The Spotify player could not connect.'));
      })
      .catch(() => fail(playbackFailure('device', 'The Spotify player could not connect.')));
  });
}

export class SpotifyWebPlayback implements PlaybackPort {
  readonly kind = 'spotify' as const;

  private readonly options: SpotifyPlaybackOptions;
  private player: SpotifyPlayerLike | undefined;
  private deviceId: string | undefined;
  private ready: Promise<string> | undefined;

  constructor(options: SpotifyPlaybackOptions) {
    this.options = options;
  }

  private connect(): Promise<string> {
    if (this.ready) return this.ready;
    this.ready = this.createConnection().catch(error => {
      this.player?.disconnect();
      this.player = undefined;
      this.deviceId = undefined;
      this.ready = undefined;
      throw error;
    });
    return this.ready;
  }

  private async createConnection(): Promise<string> {
    const sdk = await (this.options.loadSdk ?? loadSpotifySdk)();
    let rejectToken!: (error: PlaybackError) => void;
    const tokenFailure = new Promise<never>((_, reject) => {
      rejectToken = reject;
    });
    const player = new sdk.Player({
      name: PLAYER_NAME,
      volume: this.options.volume ?? 0.8,
      getOAuthToken: cb => {
        void this.options
          .getToken()
          .then(cb)
          .catch(() => rejectToken(playbackFailure('auth', 'Spotify sign-in expired. Sign in again.')));
      },
    });
    this.player = player;

    const deviceId = await waitForDevice(
      player,
      tokenFailure,
      this.options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    );
    this.deviceId = deviceId;
    return deviceId;
  }

  async start(target: PlaybackTarget): Promise<void> {
    if (!target.uri || target.uri === 'unknown') {
      throw playbackFailure('playback', 'The current round has no valid Spotify track URI.');
    }
    const deviceId = await this.connect();
    const token = await this.options.getToken().catch(() => {
      throw playbackFailure('auth', 'Spotify sign-in expired. Sign in again.');
    });
    const doFetch = this.options.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await doFetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
        {
          method: 'PUT',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ uris: [target.uri], position_ms: target.position_ms }),
        },
      );
    } catch {
      throw playbackFailure('playback', 'Could not reach Spotify to start the track.');
    }
    if (response.status === 401) {
      throw playbackFailure('auth', 'Spotify rejected the session. Sign in again.');
    }
    if (response.status === 403) {
      throw playbackFailure('premium', 'Spotify playback requires a Premium account.');
    }
    if (!response.ok && response.status !== 204) {
      throw playbackFailure('playback', 'Spotify refused to start the track.');
    }
  }

  async pause(): Promise<void> {
    await this.player?.pause();
  }

  async resume(): Promise<void> {
    await this.player?.resume();
  }

  async stop(): Promise<void> {
    if (!this.player) return;
    try {
      await this.player.pause();
    } catch {
      // Teardown remains best-effort.
    }
    this.player.disconnect();
    this.player = undefined;
    this.deviceId = undefined;
    this.ready = undefined;
  }

  get device(): string | undefined {
    return this.deviceId;
  }
}
