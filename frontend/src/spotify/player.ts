/**
 * Playback boundary.
 *
 * Three implementations satisfy `PlaybackPort`:
 *  - `StubPlayback` (this file) records what *would* be played. It is used when
 *    no Spotify account is connected, and in tests, so the game flow works
 *    offline and without Premium.
 *  - `UnavailablePlayback` (this file) fails explicitly; it is wired in only
 *    when real playback was requested but never configured, so a broken auth
 *    flow can never be hidden behind fake audio.
 *  - `SpotifyWebPlayback` (./webPlayback) produces real audio through the
 *    Spotify Web Playback SDK.
 */

import { SpotifyWebPlayback } from './webPlayback';

export interface PlaybackTarget {
  uri: string;
  position_ms: number;
}

export interface PlaybackPort {
  /** Human-readable capability label, rendered in the UI. */
  readonly kind: 'stub' | 'spotify' | 'unavailable';
  start(target: PlaybackTarget): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
}

/** Records calls instead of producing audio. Never claims Spotify playback. */
export class StubPlayback implements PlaybackPort {
  readonly kind = 'stub' as const;
  last: PlaybackTarget | undefined;
  calls: string[] = [];

  async start(target: PlaybackTarget): Promise<void> {
    this.last = target;
    this.calls.push('start');
  }

  async pause(): Promise<void> {
    this.calls.push('pause');
  }

  async resume(): Promise<void> {
    this.calls.push('resume');
  }

  async stop(): Promise<void> {
    this.last = undefined;
    this.calls.push('stop');
  }
}

export const PLAYBACK_UNAVAILABLE_NOTICE =
  'No Spotify account is connected, so the quiz cannot play audio. ' +
  'Play the track yourself; the quiz keeps time and score.';

export const PLAYBACK_READY_NOTICE =
  'Spotify is connected. Rounds play through this browser; Spotify Premium is required.';

/** Real playback must be wired explicitly; never hide a failed auth flow with fake audio. */
export class UnavailablePlayback implements PlaybackPort {
  readonly kind = 'unavailable' as const;
  async start(_target: PlaybackTarget): Promise<void> {
    throw new Error('Spotify Web Playback is not configured');
  }
  async pause(): Promise<void> {}
  async resume(): Promise<void> {}
  async stop(): Promise<void> {}
}

export function createPlayback(
  getToken: () => Promise<string> = async () => {
    const response = await fetch('/api/v1/auth/token', {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('Spotify authentication is required');
    const body = (await response.json()) as { access_token: string };
    return body.access_token;
  },
  onError?: (message: string) => void,
): PlaybackPort {
  if (import.meta.env.VITE_FAKE_SPOTIFY === 'true') return new StubPlayback();
  // The real adapter fails explicitly when no authenticated token is available.
  return new SpotifyWebPlayback({ getToken, onError });
}
