/**
 * Spotify Web Playback SDK adapter.
 *
 * This is the real audio path. It loads the SDK on demand, registers a browser
 * device with a token fetched from the backend, and drives it through the same
 * `PlaybackPort` the stub implements, so the game logic does not change.
 *
 * Requirements the caller must respect:
 *  - a connected Spotify account with the `streaming` scope, and
 *  - a Spotify Premium subscription (the SDK refuses to play otherwise), and
 *  - a user gesture before the first `start()` call (browser autoplay policy).
 */

import type { PlaybackPort, PlaybackTarget } from './player';

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
const PLAYER_NAME = 'Spotify Music Quiz';

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

/** Loads the SDK script once per page and resolves when it is ready. */
export function loadSpotifySdk(timeoutMs = 15_000): Promise<SpotifyGlobal> {
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
  /** Fetches a fresh access token from the backend. */
  getToken: () => Promise<string>;
  /** Injectable for tests. */
  loadSdk?: (timeoutMs?: number) => Promise<SpotifyGlobal>;
  fetchImpl?: typeof fetch;
  volume?: number;
}

/** Plays real audio through the Spotify Web Playback SDK. */
export class SpotifyWebPlayback implements PlaybackPort {
  readonly kind = 'spotify' as const;

  private readonly options: SpotifyPlaybackOptions;
  private player: SpotifyPlayerLike | undefined;
  private deviceId: string | undefined;
  private ready: Promise<string> | undefined;

  constructor(options: SpotifyPlaybackOptions) {
    this.options = options;
  }

  /** Connects the SDK and resolves with the device id, once. */
  private connect(): Promise<string> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const sdk = await (this.options.loadSdk ?? loadSpotifySdk)();
      const player = new sdk.Player({
        name: PLAYER_NAME,
        volume: this.options.volume ?? 0.8,
        getOAuthToken: cb => {
          void this.options
            .getToken()
            .then(cb)
            .catch(() => undefined);
        },
      });

      const deviceId = await new Promise<string>((resolve, reject) => {
        player.addListener('ready', (payload: never) => {
          resolve((payload as unknown as { device_id: string }).device_id);
        });
        player.addListener('authentication_error', () => {
          reject(new PlaybackError('auth', 'Spotify rejected the session. Sign in again.'));
        });
        player.addListener('account_error', () => {
          reject(new PlaybackError('premium', 'Spotify playback requires a Premium account.'));
        });
        player.addListener('initialization_error', () => {
          reject(new PlaybackError('unsupported', 'This browser cannot play Spotify audio.'));
        });
        void player
          .connect()
          .then(connected => {
            if (!connected) {
              reject(new PlaybackError('device', 'The Spotify player could not connect.'));
            }
          })
          .catch(() => {
            reject(new PlaybackError('device', 'The Spotify player could not connect.'));
          });
      });

      this.player = player;
      this.deviceId = deviceId;
      return deviceId;
    })();

    this.ready = this.ready.catch(error => {
      // A failed connection must not poison every later attempt.
      this.ready = undefined;
      throw error;
    });
    return this.ready;
  }

  async start(target: PlaybackTarget): Promise<void> {
    const deviceId = await this.connect();
    const token = await this.options.getToken();
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
      throw new PlaybackError('playback', 'Could not reach Spotify to start the track.');
    }
    if (response.status === 401) {
      throw new PlaybackError('auth', 'Spotify rejected the session. Sign in again.');
    }
    if (response.status === 403) {
      throw new PlaybackError('premium', 'Spotify playback requires a Premium account.');
    }
    if (!response.ok && response.status !== 204) {
      throw new PlaybackError('playback', 'Spotify refused to start the track.');
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
      // A pause failure on teardown is not actionable for the user.
    }
    this.player.disconnect();
    this.player = undefined;
    this.deviceId = undefined;
    this.ready = undefined;
  }

  /** Exposed for diagnostics and tests. */
  get device(): string | undefined {
    return this.deviceId;
  }
}
