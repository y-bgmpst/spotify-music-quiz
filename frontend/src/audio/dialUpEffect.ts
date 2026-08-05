/**
 * Authentic dial-up modem handshake playback.
 *
 * The recording is William Termini's 28.6 second dial-up modem handshake,
 * published on Wikimedia Commons and dedicated to the public domain by the
 * copyright holder. The browser streams the OGG file directly from Wikimedia
 * until the asset is vendored into the release package.
 *
 * Contract:
 * - playback only starts after the caller's user interaction
 * - only one handshake can play at a time
 * - abort/stop pauses immediately and releases the media element
 * - blocked or unavailable audio never prevents the quiz from starting
 */

export interface DialUpEffectOptions {
  /** Playback volume, clamped to 0..1. */
  volume: number;
  /** Optional maximum playback time, clamped to 1..30 seconds. */
  durationMs?: number;
  /** Caller-owned cancellation. */
  signal?: AbortSignal;
}

export const DIAL_UP_AUDIO_URL =
  'https://upload.wikimedia.org/wikipedia/commons/3/33/Dial_up_modem_noises.ogg';

const MIN_DURATION_MS = 1000;
const MAX_DURATION_MS = 30_000;
const DEFAULT_DURATION_MS = 28_700;

let currentRun: AbortController | undefined;
let currentAudio: HTMLAudioElement | undefined;

/** Kept for compatibility with existing diagnostics and tests. */
export function openAudioContextCount(): number {
  return currentAudio ? 1 : 0;
}

export function isDialUpEffectPlaying(): boolean {
  return currentRun !== undefined && currentAudio !== undefined;
}

/** Cancels a running effect. Safe to call when nothing is playing. */
export function stopDialUpEffect(): void {
  currentRun?.abort();
  currentRun = undefined;
  releaseAudio();
}

function releaseAudio(): void {
  const audio = currentAudio;
  currentAudio = undefined;
  if (!audio) return;
  try {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  } catch {
    // A detached or already-failed media element needs no further cleanup.
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export async function playDialUpEffect(
  options: DialUpEffectOptions,
): Promise<void> {
  const volume = clamp(options.volume, 0, 1);
  const durationMs = clamp(
    options.durationMs ?? DEFAULT_DURATION_MS,
    MIN_DURATION_MS,
    MAX_DURATION_MS,
  );

  if (options.signal?.aborted || volume === 0 || typeof Audio === 'undefined') {
    return;
  }

  stopDialUpEffect();

  const run = new AbortController();
  const audio = new Audio(DIAL_UP_AUDIO_URL);
  currentRun = run;
  currentAudio = audio;

  audio.preload = 'auto';
  audio.volume = volume;
  audio.loop = false;

  const externalAbort = () => run.abort();
  options.signal?.addEventListener('abort', externalAbort, { once: true });

  try {
    const finished = waitForPlaybackEnd(audio, durationMs, run.signal);
    await audio.play();
    await finished;
  } catch {
    // Browser autoplay policy, unavailable network/audio device, or media
    // decoding errors are non-fatal decoration failures.
  } finally {
    options.signal?.removeEventListener('abort', externalAbort);
    if (currentRun === run) {
      currentRun = undefined;
      releaseAudio();
    }
  }
}

function waitForPlaybackEnd(
  audio: HTMLAudioElement,
  maximumMs: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const timeout = window.setTimeout(finish, maximumMs);

    function finish(): void {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      audio.removeEventListener('ended', finish);
      audio.removeEventListener('error', finish);
      signal.removeEventListener('abort', finish);
      resolve();
    }

    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', finish, { once: true });
    signal.addEventListener('abort', finish, { once: true });

    if (signal.aborted) finish();
  });
}
