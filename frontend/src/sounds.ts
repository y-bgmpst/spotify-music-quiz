/**
 * Short 90s-style UI sound effects, synthesised with the Web Audio API.
 *
 * All effects are generated at runtime, so the repository ships no audio
 * assets. Every entry point is a no-op when sounds are muted or when the
 * environment has no Web Audio implementation (jsdom, older Safari, a browser
 * that blocks audio before a user gesture).
 */
class SoundEffects {
  private audioContext: AudioContext | null = null;
  private enabled = true;
  /** Scales every effect. 0 mutes without changing the enabled flag. */
  private masterVolume = 0.5;

  /** Master switch, driven by the audio preferences dialog. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setVolume(volume: number): void {
    if (!Number.isFinite(volume)) return;
    this.masterVolume = Math.min(1, Math.max(0, volume));
  }

  private getContext(): AudioContext | null {
    if (!this.enabled || this.masterVolume === 0) return null;
    if (this.audioContext) return this.audioContext;
    const Ctor =
      typeof window === 'undefined'
        ? undefined
        : (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctor) return null;
    try {
      this.audioContext = new Ctor();
    } catch {
      return null;
    }
    return this.audioContext;
  }

  private beep(frequency: number, duration: number, volume = 0.3): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'square'; // Classic 90s beep sound

    const peak = Math.max(0.0001, volume * this.masterVolume);
    gainNode.gain.setValueAtTime(peak, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  }

  // Windows 95 startup chord inspired
  start(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Play a chord: C, E, G
    [261.63, 329.63, 392.0].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.value = freq;
      osc.type = 'sine';

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15 * this.masterVolume, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

      osc.start(now + i * 0.05);
      osc.stop(now + 1.5);
    });
  }

  // High-pitched reveal sound
  reveal(): void {
    this.beep(1000, 0.1, 0.2);
    setTimeout(() => this.beep(1200, 0.1, 0.2), 100);
    setTimeout(() => this.beep(1500, 0.2, 0.3), 200);
  }

  // Next round transition
  next(): void {
    this.beep(400, 0.15, 0.25);
    setTimeout(() => this.beep(500, 0.15, 0.25), 150);
  }

  // Score awarded
  score(): void {
    this.beep(800, 0.08, 0.2);
    setTimeout(() => this.beep(1000, 0.08, 0.2), 80);
    setTimeout(() => this.beep(1200, 0.12, 0.25), 160);
  }

  // Error sound
  error(): void {
    this.beep(200, 0.3, 0.3);
  }

  // Time warning (last 10 seconds)
  warning(): void {
    this.beep(800, 0.1, 0.15);
  }
}

export const sounds = new SoundEffects();
