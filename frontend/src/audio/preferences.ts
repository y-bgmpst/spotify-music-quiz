/**
 * Audio preferences.
 *
 * Deliberately a tiny localStorage-backed module rather than a new state
 * container: the app has no preferences infrastructure yet and four booleans
 * do not justify one. Reads tolerate a missing, blocked, or corrupted store.
 */

export interface AudioPreferences {
  /** Play the dial-up handshake when a new game starts. */
  introSound: boolean;
  /** Peak volume for the intro and UI sounds, 0-1. */
  volume: number;
  /** Skip the intro without turning the setting off. */
  skipIntro: boolean;
  /** Master switch for the short UI beeps. */
  uiSounds: boolean;
}

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  introSound: true,
  volume: 0.5,
  skipIntro: false,
  uiSounds: true,
};

const STORAGE_KEY = 'smq.audio-preferences.v1';

/** True when the user asked the OS for reduced motion / reduced sensory load. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function clampVolume(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_AUDIO_PREFERENCES.volume;
  return Math.min(1, Math.max(0, numeric));
}

export function loadAudioPreferences(): AudioPreferences {
  const defaults: AudioPreferences = {
    ...DEFAULT_AUDIO_PREFERENCES,
    // Reduced motion also means reduced sensory load: no surprise handshake.
    introSound: !prefersReducedMotion(),
  };

  if (typeof localStorage === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AudioPreferences>;
    return {
      introSound: typeof parsed.introSound === 'boolean' ? parsed.introSound : defaults.introSound,
      volume: clampVolume(parsed.volume),
      skipIntro: parsed.skipIntro === true,
      uiSounds: parsed.uiSounds !== false,
    };
  } catch {
    return defaults;
  }
}

export function saveAudioPreferences(preferences: AudioPreferences): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* private mode or a full quota: preferences stay session-only */
  }
}

/** Should the handshake actually play for this configuration? */
export function shouldPlayIntro(preferences: AudioPreferences): boolean {
  return preferences.introSound && !preferences.skipIntro && preferences.volume > 0;
}
