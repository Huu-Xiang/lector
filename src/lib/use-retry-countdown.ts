'use client';

import { useCallback, useEffect, useState } from 'react';

/** Counts down after a 429 so a form can lock itself and say how long to wait. */
export function useRetryCountdown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);

  const block = useCallback((seconds: number) => {
    setNow(Date.now());
    setUntil(Date.now() + seconds * 1000);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((until - now) / 1000));
  return { secondsLeft, minutesLeft: Math.ceil(secondsLeft / 60), block };
}
