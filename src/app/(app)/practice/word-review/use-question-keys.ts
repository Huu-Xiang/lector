import { useEffect, useRef } from 'react';
import { shouldIgnoreKey } from './questions';

export function useQuestionKeys(onKey: (event: KeyboardEvent) => void, enabled = true) {
  const handler = useRef(onKey);
  useEffect(() => {
    handler.current = onKey;
  });

  useEffect(() => {
    if (!enabled) return;
    const listener = (event: KeyboardEvent) => {
      if (event.repeat || shouldIgnoreKey(event)) return;
      handler.current(event);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [enabled]);
}
