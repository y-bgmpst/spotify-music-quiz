/**
 * Playback boundary.
 *
 * Two implementations satisfy `PlaybackPort`:
 *  - `StubPlayback` (this file) records what *would* be played. It is used when
 *    no Spotify account is connected, and in tests, so the game flow works
 *    offline and without Premium.
 *  - `SpotifyWebPlayback` (./webPlayback) produces real audio through the
 *    Spotify Web Playback SDK.
 */

export interface PlaybackTarget {
  uri: string;
  position_ms: number;
}

export interface PlaybackPort {
  /** Human-readable capability label, rendered in the UI. */
  readonly kind: 'stub' | 'spotify';
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
