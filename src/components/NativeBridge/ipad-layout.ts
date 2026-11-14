'use client';

import { useSyncExternalStore } from 'react';
import { isNativeApp } from '@/lib/native-app';

// Keep this breakpoint in step with the iPad rules in globals.css.
const REGULAR_WINDOW = '(min-width: 48rem)';

export function isIPadApp() {
  return (
    isNativeApp() &&
    (/\biPad\b/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  );
}

const subscribe = (change: () => void) => {
  const query = window.matchMedia(REGULAR_WINDOW);
  query.addEventListener('change', change);
  return () => query.removeEventListener('change', change);
};

export function useRegularIPadWindow() {
  return useSyncExternalStore(
    subscribe,
    () => isIPadApp() && window.matchMedia(REGULAR_WINDOW).matches,
    () => false,
  );
}
