import { useState, useEffect, useRef } from 'react';

export interface CountdownState {
  remaining: number;
  formatted: string;
  isZero: boolean;
  percentage: number;
}

/**
 * Robust countdown timer surviving wrong client clocks.
 * Uses performance.now() elapsed monotonic time instead of Date.now().
 * Re-syncs whenever server sends updated expiresInSeconds.
 */
export function useCountdown(
  serverExpiresInSeconds: number | undefined,
  totalDurationSeconds: number = 120,
): CountdownState {
  const [remaining, setRemaining] = useState<number>(serverExpiresInSeconds ?? 0);
  const baselineRef = useRef<{ serverExpiresIn: number; receivedAt: number } | null>(null);

  // When server sends an updated expiresInSeconds, re-sync our baseline
  useEffect(() => {
    if (serverExpiresInSeconds !== undefined && serverExpiresInSeconds !== null) {
      baselineRef.current = {
        serverExpiresIn: serverExpiresInSeconds,
        receivedAt: performance.now(),
      };
      setRemaining(serverExpiresInSeconds);
    }
  }, [serverExpiresInSeconds]);

  useEffect(() => {
    if (!baselineRef.current) return;

    const interval = setInterval(() => {
      if (!baselineRef.current) return;
      const elapsedSeconds = (performance.now() - baselineRef.current.receivedAt) / 1000;
      const calculated = Math.max(0, Math.ceil(baselineRef.current.serverExpiresIn - elapsedSeconds));
      setRemaining(calculated);
    }, 250);

    return () => clearInterval(interval);
  }, []);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isZero = remaining <= 0;
  const percentage = Math.min(100, Math.max(0, (remaining / totalDurationSeconds) * 100));

  return {
    remaining,
    formatted,
    isZero,
    percentage,
  };
}
