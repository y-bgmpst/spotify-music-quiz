import { useEffect, useRef, useState } from 'react';

/**
 * Renders a countdown from a backend-supplied remaining duration.
 *
 * The backend owns the excerpt clock. This hook only interpolates between
 * server answers using a monotonic client clock anchored at the moment the
 * answer arrived, so a slow render or a background tab cannot make the UI and
 * the server disagree about how much time is left: every server response
 * re-anchors the display.
 */
export function useCountdown(remainingMs: number, running: boolean): number {
  const [displayMs, setDisplayMs] = useState(remainingMs);
  const anchor = useRef({ at: 0, remaining: remainingMs });

  useEffect(() => {
    anchor.current = { at: performance.now(), remaining: remainingMs };
    setDisplayMs(remainingMs);
  }, [remainingMs, running]);

  useEffect(() => {
    if (!running || remainingMs <= 0) return;
    const id = window.setInterval(() => {
      const elapsed = performance.now() - anchor.current.at;
      setDisplayMs(Math.max(0, anchor.current.remaining - elapsed));
    }, 200);
    return () => window.clearInterval(id);
  }, [running, remainingMs]);

  return displayMs;
}

export function formatClock(totalMs: number): string {
  const totalSeconds = Math.ceil(Math.max(0, totalMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
