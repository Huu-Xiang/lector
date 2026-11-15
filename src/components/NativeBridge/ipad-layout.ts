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

export function iosAppearance(userAgent: string): 'classic' | 'modern' | 'glass' {
  const explicit = /\bReadfoxOS\/(\d+)\b/.exec(userAgent);
  const mobile = /\b(?:CPU (?:iPhone )?OS|iPhone OS) (\d+)[_.]/.exec(userAgent);
  // Desktop-mode iPad user agents can report a fixed macOS version.
  const safari = /\bVersion\/(\d+)(?:\.|\b)/.exec(userAgent);
  const major = Number(explicit?.[1] ?? mobile?.[1] ?? safari?.[1] ?? 0);
  if (major >= 26) return 'glass';
  if (major >= 18) return 'modern';
  return 'classic';
}

export function supportsIPadTopTabs(appearance: ReturnType<typeof iosAppearance>) {
  return appearance !== 'classic';
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

export function useIPadTopTabs() {
  return useRegularIPadWindow() && supportsIPadTopTabs(iosAppearance(navigator.userAgent));
}
