import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { formatClock, useCountdown } from '../src/useCountdown';

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [999, '0:01'],
    [10_000, '0:10'],
    [61_000, '1:01'],
    [-500, '0:00'],
  ])('formats %ims as %s', (ms, expected) => {
    expect(formatClock(ms)).toBe(expected);
  });
});

describe('useCountdown', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts from the server-supplied remaining time', () => {
    const { result } = renderHook(() => useCountdown(10_000, true));

    expect(result.current).toBe(10_000);
  });

  it('counts down while running', () => {
    vi.useFakeTimers();
    const start = performance.now();
    vi.spyOn(performance, 'now').mockReturnValue(start);
    const { result } = renderHook(() => useCountdown(10_000, true));

    act(() => {
      vi.spyOn(performance, 'now').mockReturnValue(start + 3000);
      vi.advanceTimersByTime(3000);
    });

    expect(result.current).toBeCloseTo(7000, -2);
  });

  it('never counts below zero', () => {
    vi.useFakeTimers();
    const start = performance.now();
    vi.spyOn(performance, 'now').mockReturnValue(start);
    const { result } = renderHook(() => useCountdown(1000, true));

    act(() => {
      vi.spyOn(performance, 'now').mockReturnValue(start + 60_000);
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current).toBe(0);
  });

  it('freezes when the round is not running', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCountdown(6000, false));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current).toBe(6000);
  });

  it('re-anchors to a new server value, so client drift cannot accumulate', () => {
    vi.useFakeTimers();
    const start = performance.now();
    vi.spyOn(performance, 'now').mockReturnValue(start);
    const { result, rerender } = renderHook(
      ({ remaining }: { remaining: number }) => useCountdown(remaining, true),
      { initialProps: { remaining: 10_000 } },
    );

    act(() => {
      vi.spyOn(performance, 'now').mockReturnValue(start + 9000);
      vi.advanceTimersByTime(9000);
    });
    expect(result.current).toBeLessThan(2000);

    // The server reports a different truth; the UI must adopt it immediately.
    rerender({ remaining: 8000 });
    expect(result.current).toBe(8000);
  });
});
