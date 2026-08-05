// 90s-style sound effects using Web Audio API
class SoundEffects {
  private audioContext: AudioContext | null = null;

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  private beep(
    frequency: number,
    duration: number,
    volume: number = 0.3,
  ): void {
    const ctx = this.getContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'square'; // Classic 90s beep sound

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      ctx.currentTime + duration,
    );

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  }

  // Windows 95 startup chord inspired
  start(): void {
    const ctx = this.getContext();
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
      gain.gain.linearRampToValueAtTime(0.15, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);

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
