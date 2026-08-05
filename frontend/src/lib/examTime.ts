'use client';
import { useEffect, useState } from 'react';

/** Seconds as `mm:ss`, growing to `h:mm:ss` past the hour. The clock is shown
 *  so a student can learn to pace themselves; it never stops them. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0
    ? `${hours}:${pad(minutes % 60)}:${pad(seconds % 60)}`
    : `${minutes}:${pad(seconds % 60)}`;
}

/** Ticks once a second from the moment the paper was drawn. `startedAt` is the
 *  server's UTC timestamp, so a phone with a skewed clock only shifts what the
 *  player sees — never what is stored with the Session. */
export function useElapsedSeconds(startedAt: string | null): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return elapsed;
}
