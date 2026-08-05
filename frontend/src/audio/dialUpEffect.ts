/**
 * Synthetic dial-up handshake effect.
 *
 * Why synthesised and not a sample: shipping a recording of a real 1990s modem
 * would mean shipping audio of unclear provenance. Everything here is generated
 * at runtime with the Web Audio API, so the repository carries no audio assets
 * and no third-party licence obligations.
 *
 * Contract:
 * - never throws for an environment without Web Audio; it resolves instead
 * - never keeps an AudioContext open after the promise settles
 * - only one effect can be audible at a time; a new call cancels the previous
 * - honours an AbortSignal at any point, including before the first sample
 */

export interface DialUpEffectOptions {
  /** Peak gain, 0 (silent) to 1 (loud). Values outside the range are clamped. */
  volume: number;
  /** Total duration. Clamped to 1000-6000 ms. Defaults to 3800 ms. */
  durationMs?: number;
  /** Caller-owned cancellation. */
  signal?: AbortSignal;
}

const MIN_DURATION_MS = 1000;
const MAX_DURATION_MS = 6000;
const DEFAULT_DURATION_MS = 3800;

type AudioContextCtor = typeof AudioContext;

/** Contexts this module has opened and not yet closed. Used by tests. */
let openContexts = 0;
/** Aborts the previous effect so two clicks cannot stack two handshakes. */
let currentRun: AbortController | undefined;

export function openAudioContextCount(): number {
  return openContexts;
}

export function isDialUpEffectPlaying(): boolean {
  return currentRun !== undefined;
}

/** Cancels a running effect. Safe to call when nothing is playing. */
export function stopDialUpEffect(): void {
  currentRun?.abort();
  currentRun = undefined;
}

function resolveContextCtor(): AudioContextCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const scope = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Band-limited noise buffer standing in for the carrier hiss. */
function createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer | undefined {
  if (typeof ctx.createBuffer !== 'function') return undefined;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    channel[i] = (Math.random() * 2 - 1) * 0.6;
  }
  return buffer;
}

/**
 * Plays a short handshake: two dial tones, a warble, then carrier noise that
 * fades out. Resolves when the sound finished, was skipped, or could not run.
 */
export async function playDialUpEffect(options: DialUpEffectOptions): Promise<void> {
  const volume = clamp(options.volume, 0, 1);
  const durationMs = clamp(options.durationMs ?? DEFAULT_DURATION_MS, MIN_DURATION_MS, MAX_DURATION_MS);

  if (options.signal?.aborted) return;
  if (volume === 0) return;

  const Ctor = resolveContextCtor();
  if (!Ctor) return;

  stopDialUpEffect();
  const run = new AbortController();
  currentRun = run;
  options.signal?.addEventListener('abort', () => run.abort(), { once: true });

  let ctx: AudioContext | undefined;
  const nodes: { disconnect: () => void }[] = [];

  try {
    ctx = new Ctor();
    openContexts += 1;
    if (typeof ctx.resume === 'function' && ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (run.signal.aborted) return;

    const master = ctx.createGain();
    master.gain.setValueAtTime(volume * 0.35, ctx.currentTime);
    master.connect(ctx.destination);
    nodes.push(master);

    const now = ctx.currentTime;
    const seconds = durationMs / 1000;

    // Two DTMF-ish dial tones, then a rising warble: recognisably "dialling"
    // without reproducing any particular recording.
    const tones: { freq: number; at: number; length: number }[] = [
      { freq: 350, at: 0, length: 0.35 },
      { freq: 440, at: 0, length: 0.35 },
      { freq: 697, at: 0.45, length: 0.16 },
      { freq: 1209, at: 0.45, length: 0.16 },
      { freq: 852, at: 0.68, length: 0.16 },
      { freq: 1336, at: 0.68, length: 0.16 },
      { freq: 1100, at: 0.95, length: 0.3 },
      { freq: 2100, at: 1.3, length: 0.45 },
    ];

    for (const tone of tones) {
      if (tone.at >= seconds) continue;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(tone.freq, now + tone.at);
      gain.gain.setValueAtTime(0.0001, now + tone.at);
      gain.gain.linearRampToValueAtTime(0.5, now + tone.at + 0.02);
      gain.gain.linearRampToValueAtTime(0.0001, now + Math.min(seconds, tone.at + tone.length));
      osc.connect(gain);
      gain.connect(master);
      osc.start(now + tone.at);
      osc.stop(now + Math.min(seconds, tone.at + tone.length) + 0.02);
      nodes.push(osc, gain);
    }

    // Carrier hiss for the remainder, gently faded so there is no harsh peak.
    const noiseStart = Math.min(1.75, seconds * 0.5);
    const noiseLength = Math.max(0.2, seconds - noiseStart - 0.1);
    const buffer = createNoiseBuffer(ctx, noiseLength);
    if (buffer && typeof ctx.createBufferSource === 'function') {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now + noiseStart);
      gain.gain.linearRampToValueAtTime(0.35, now + noiseStart + 0.15);
      gain.gain.linearRampToValueAtTime(0.0001, now + noiseStart + noiseLength);
      if (typeof ctx.createBiquadFilter === 'function') {
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1800, now + noiseStart);
        source.connect(filter);
        filter.connect(gain);
        nodes.push(filter);
      } else {
        source.connect(gain);
      }
      gain.connect(master);
      source.start(now + noiseStart);
      source.stop(now + noiseStart + noiseLength);
      nodes.push(source, gain);
    }

    await waitFor(durationMs, run.signal);
  } catch {
    // A blocked or unavailable audio device must never surface to the caller:
    // the intro is decoration, the game start is the contract.
    return;
  } finally {
    for (const node of nodes) {
      try {
        node.disconnect();
      } catch {
        /* already detached */
      }
    }
    if (ctx) {
      try {
        await ctx.close();
      } catch {
        /* context already closed by the browser */
      }
      openContexts = Math.max(0, openContexts - 1);
    }
    if (currentRun === run) currentRun = undefined;
  }
}

function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const id = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
    function finish() {
      clearTimeout(id);
      resolve();
    }
  });
}
