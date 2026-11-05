'use client';

import { useSyncExternalStore } from 'react';

declare global {
  interface Window {
    Capacitor?: { isNativePlatform?: () => boolean };
  }
}

/** The iOS shell appends `ReadfoxApp/<version>` to the WebView user agent. */
const APP_UA_MARK = 'ReadfoxApp/';

export function isNativeUserAgent(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent?.includes(APP_UA_MARK));
}

export function detectNativeApp(env: { userAgent: string; capacitorNative: boolean }): boolean {
  return env.capacitorNative || isNativeUserAgent(env.userAgent);
}

function snapshot(): boolean {
  return detectNativeApp({
    userAgent: navigator.userAgent,
    capacitorNative: window.Capacitor?.isNativePlatform?.() === true,
  });
}

/** True inside the iPhone app. Client only; use `useIsNativeApp` in components. */
export function isNativeApp(): boolean {
  return typeof window !== 'undefined' && snapshot();
}

/** False during SSR and the first client render, so the page hydrates like the web. */
export function useIsNativeApp(): boolean {
  return useSyncExternalStore(
    () => () => {},
    snapshot,
    () => false,
  );
}
