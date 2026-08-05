import '@testing-library/jest-dom/vitest';

// jsdom does not implement the Web Audio API used by src/sounds.ts.
class StubAudioContext {
  currentTime = 0;
  destination = {};
  state = 'running';
  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime() {}, value: 0 },
      connect() {},
      start() {},
      stop() {},
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} },
      connect() {},
    };
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}

Object.defineProperty(window, 'AudioContext', {
  writable: true,
  value: StubAudioContext,
});
Object.defineProperty(window, 'webkitAudioContext', {
  writable: true,
  value: StubAudioContext,
});
