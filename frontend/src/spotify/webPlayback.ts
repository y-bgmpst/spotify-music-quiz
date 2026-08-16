/**
 * Spotify Web Playback SDK adapter.
 *
 * This is the real audio path. It loads the SDK on demand, registers a browser
 * device with a token fetched from the backend, and drives it through the same
 * `PlaybackPort` the stub implements, so the game logic does not change.
 */

import type { PlaybackPort, PlaybackTarget } from './player';

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
const PLAYER_NAME = 'Back to the 90s – Amt 16 Musikquiz';
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
  activateElement?: () => Promise<void>;
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

export function loadSpotifySdk(
  timeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
): Promise<SpotifyGlobal> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(
      new PlaybackError(
        'unsupported',
        'Für die Wiedergabe wird ein Browserfenster benötigt.',
      ),
    );
  }
  if (window.Spotify) return Promise.resolve(window.Spotify);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<SpotifyGlobal>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      sdkPromise = undefined;
      reject(
        new PlaybackError(
          'unsupported',
          'Der Spotify-Player konnte nicht geladen werden.',
        ),
      );
    }, timeoutMs);

    window.onSpotifyWebPlaybackSDKReady = () => {
      window.clearTimeout(timer);
      if (window.Spotify) resolve(window.Spotify);
      else
        reject(
          new PlaybackError(
            'unsupported',
            'Der Spotify-Player konnte nicht geladen werden.',
          ),
        );
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SDK_URL}"]`,
    );
    if (existing) return;
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      sdkPromise = undefined;
      reject(
        new PlaybackError(
          'unsupported',
          'Das Spotify-Player-Skript konnte nicht geladen werden.',
        ),
      );
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export interface SpotifyPlaybackOptions {
  getToken: () => Promise<string>;
  onError?: (message: string) => void;
  loadSdk?: (timeoutMs?: number) => Promise<SpotifyGlobal>;
  fetchImpl?: typeof fetch;
  volume?: number;
  connectTimeoutMs?: number;
}

function playbackFailure(
  kind: PlaybackError['kind'],
  message: string,
): PlaybackError {
  return new PlaybackError(kind, message);
}

function waitForDevice(
  player: SpotifyPlayerLike,
  tokenFailure: Promise<never>,
  timeoutMs: number,
  onRuntimeError: (error: PlaybackError) => void,
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
    const report = (error: PlaybackError) => {
      if (settled) onRuntimeError(error);
      else fail(error);
    };
    const timer = window.setTimeout(() => {
      fail(
        playbackFailure(
          'device',
          'Der Spotify-Player wurde nicht rechtzeitig bereit.',
        ),
      );
    }, timeoutMs);

    player.addListener('ready', (payload: never) => {
      const deviceId = (payload as unknown as { device_id?: string }).device_id;
      if (!deviceId) {
        fail(
          playbackFailure(
            'device',
            'Spotify hat kein Wiedergabegerät bereitgestellt.',
          ),
        );
        return;
      }
      finish(() => resolve(deviceId));
    });
    player.addListener('authentication_error', () => {
      report(
        playbackFailure(
          'auth',
          'Spotify hat die Sitzung abgelehnt. Bitte erneut anmelden.',
        ),
      );
    });
    player.addListener('account_error', () => {
      report(
        playbackFailure(
          'premium',
          'Spotify-Wiedergabe erfordert ein Premium-Konto.',
        ),
      );
    });
    player.addListener('initialization_error', () => {
      report(
        playbackFailure(
          'unsupported',
          'Dieser Browser kann Spotify-Audio nicht abspielen.',
        ),
      );
    });
    player.addListener('not_ready', () => {
      report(
        playbackFailure(
          'device',
          'Das Spotify-Wiedergabegerät ist nicht verfügbar.',
        ),
      );
    });
    player.addListener('playback_error', () => {
      report(playbackFailure('playback', 'Spotify-Wiedergabe fehlgeschlagen.'));
    });

    void tokenFailure.catch((error: PlaybackError) => fail(error));
    void player
      .connect()
      .then((connected) => {
        if (!connected)
          fail(
            playbackFailure(
              'device',
              'Der Spotify-Player konnte keine Verbindung herstellen.',
            ),
          );
      })
      .catch(() =>
        fail(
          playbackFailure(
            'device',
            'Der Spotify-Player konnte keine Verbindung herstellen.',
          ),
        ),
      );
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
    this.ready = this.createConnection().catch((error) => {
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
      getOAuthToken: (cb) => {
        void this.options
          .getToken()
          .then(cb)
          .catch(() =>
            rejectToken(
              playbackFailure(
                'auth',
                'Die Spotify-Anmeldung ist abgelaufen. Bitte erneut anmelden.',
              ),
            ),
          );
      },
    });
    this.player = player;

    // Spotify requires this call from a user gesture in browsers that gate
    // autoplay/audio contexts. The diagnostic button and Play action both
    // originate from a user gesture, so use it before connecting the device.
    try {
      await player.activateElement?.();
    } catch {
      throw playbackFailure(
        'unsupported',
        'Dieser Browser kann Spotify-Audio nicht abspielen.',
      );
    }

    const deviceId = await waitForDevice(
      player,
      tokenFailure,
      this.options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
      (error) => {
        if (error.kind === 'device') {
          this.deviceId = undefined;
          this.ready = undefined;
        }
        this.options.onError?.(error.message);
      },
    );
    this.deviceId = deviceId;
    return deviceId;
  }

  async start(target: PlaybackTarget): Promise<void> {
    if (!target.uri || target.uri === 'unknown') {
      throw playbackFailure(
        'playback',
        'Die aktuelle Runde enthält keine gültige Spotify-Titel-URI.',
      );
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
          body: JSON.stringify({
            uris: [target.uri],
            position_ms: target.position_ms,
          }),
        },
      );
    } catch {
      throw playbackFailure(
        'playback',
        'Spotify konnte zum Starten des Titels nicht erreicht werden.',
      );
    }
    if (response.status === 401) {
      throw playbackFailure(
        'auth',
        'Spotify hat die Sitzung abgelehnt. Bitte erneut anmelden.',
      );
    }
    if (response.status === 403) {
      throw playbackFailure(
        'premium',
        'Spotify-Wiedergabe erfordert ein Premium-Konto.',
      );
    }
    if (!response.ok && response.status !== 204) {
      throw playbackFailure(
        'playback',
        'Spotify hat den Titelstart abgelehnt.',
      );
    }
  }

  async testConnection(): Promise<void> {
    await this.connect();
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
