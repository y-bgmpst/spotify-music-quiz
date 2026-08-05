/**
 * Playback boundary.
 *
 * IMPORTANT: this application does NOT play Spotify audio. No Web Playback
 * SDK is loaded, no device is created, and no audio is produced. The stub
 * below records what *would* be played so the game flow can be developed and
 * tested end to end without Spotify Premium.
 *
 * A real implementation must satisfy `PlaybackPort` and additionally handle
 * device readiness, Premium eligibility, and token refresh.
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
  'Audio playback is not implemented. Play the track yourself; the quiz only keeps time and score.';
