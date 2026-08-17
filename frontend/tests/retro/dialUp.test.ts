import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isDialUpEffectPlaying,
  openAudioContextCount,
  playDialUpEffect,
  stopDialUpEffect,
} from '../../src/audio/dialUpEffect';
import {
  DEFAULT_AUDIO_PREFERENCES,
  loadAudioPreferences,
  saveAudioPreferences,
  shouldPlayIntro,
} from '../../src/audio/preferences';

afterEach(() => {
  stopDialUpEffect();
  localStorage.clear();
});

describe('playDialUpEffect', () => {
  it('does nothing when the volume is zero', async () => {
    await playDialUpEffect({ volume: 0 });
    expect(openAudioContextCount()).toBe(0);
    expect(isDialUpEffectPlaying()).toBe(false);
  });

  it('does nothing when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await playDialUpEffect({ volume: 1, signal: controller.signal });
    expect(openAudioContextCount()).toBe(0);
  });

  it('resolves when the environment has no Web Audio API', async () => {
    const original = window.AudioContext;
    const originalWebkit = (
      window as unknown as { webkitAudioContext?: unknown }
    ).webkitAudioContext;
    // @ts-expect-error deliberately removing the API for this assertion
    window.AudioContext = undefined;
    // @ts-expect-error deliberately removing the API for this assertion
    window.webkitAudioContext = undefined;
    await expect(playDialUpEffect({ volume: 1 })).resolves.toBeUndefined();
    window.AudioContext = original;
    (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext =
      originalWebkit;
  });

  it('closes the audio context after an aborted run', async () => {
    const controller = new AbortController();
    const promise = playDialUpEffect({
      volume: 0.5,
      durationMs: 6000,
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort();
    await promise;
    expect(openAudioContextCount()).toBe(0);
    expect(isDialUpEffectPlaying()).toBe(false);
  });

  it('cancels a previous run so two handshakes never overlap', async () => {
    const first = playDialUpEffect({ volume: 0.5, durationMs: 6000 });
    await Promise.resolve();
    const second = playDialUpEffect({ volume: 0.5, durationMs: 6000 });
    await first;
    stopDialUpEffect();
    await second;
    expect(openAudioContextCount()).toBe(0);
  });

  it('clamps the duration into the supported range', async () => {
    vi.useFakeTimers();
    try {
      const promise = playDialUpEffect({ volume: 0.5, durationMs: 999_999 });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(6000);
      await promise;
      expect(openAudioContextCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never throws when the audio device fails', async () => {
    const original = window.AudioContext;
    // @ts-expect-error stubbing a failing constructor
    window.AudioContext = function Failing() {
      throw new Error('device blocked');
    };
    await expect(playDialUpEffect({ volume: 1 })).resolves.toBeUndefined();
    expect(openAudioContextCount()).toBe(0);
    window.AudioContext = original;
  });
});

describe('audio preferences', () => {
  it('falls back to defaults without stored data', () => {
    expect(loadAudioPreferences()).toEqual({
      ...DEFAULT_AUDIO_PREFERENCES,
      introSound: true,
    });
  });

  it('round-trips saved preferences', () => {
    saveAudioPreferences({
      introSound: false,
      volume: 0.2,
      skipIntro: true,
      uiSounds: false,
    });
    expect(loadAudioPreferences()).toEqual({
      introSound: false,
      volume: 0.2,
      skipIntro: true,
      uiSounds: false,
    });
  });

  it('recovers from corrupted storage', () => {
    localStorage.setItem('smq.audio-preferences.v1', '{not json');
    expect(loadAudioPreferences().volume).toBe(
      DEFAULT_AUDIO_PREFERENCES.volume,
    );
  });

  it('clamps an out-of-range stored volume', () => {
    localStorage.setItem(
      'smq.audio-preferences.v1',
      JSON.stringify({ volume: 42 }),
    );
    expect(loadAudioPreferences().volume).toBe(1);
  });

  it('only plays the intro when enabled, not skipped and audible', () => {
    expect(
      shouldPlayIntro({
        introSound: true,
        volume: 0.5,
        skipIntro: false,
        uiSounds: true,
      }),
    ).toBe(true);
    expect(
      shouldPlayIntro({
        introSound: false,
        volume: 0.5,
        skipIntro: false,
        uiSounds: true,
      }),
    ).toBe(false);
    expect(
      shouldPlayIntro({
        introSound: true,
        volume: 0.5,
        skipIntro: true,
        uiSounds: true,
      }),
    ).toBe(false);
    expect(
      shouldPlayIntro({
        introSound: true,
        volume: 0,
        skipIntro: false,
        uiSounds: true,
      }),
    ).toBe(false);
  });
});
