'use client';

import { useSyncExternalStore } from 'react';

type PluginMethods = Record<string, (options?: unknown) => Promise<unknown>>;

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      isPluginAvailable?: (name: string) => boolean;
      Plugins?: Record<string, PluginMethods>;
    };
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

/** The plugin when the app is running and this build of the shell has it; otherwise null. */
function plugin(name: string): PluginMethods | null {
  if (!isNativeApp()) return null;
  const bridge = window.Capacitor;
  if (bridge?.isPluginAvailable?.(name) === false) return null;
  return bridge?.Plugins?.[name] ?? null;
}

async function call(name: string, method: string, options?: unknown): Promise<void> {
  try {
    await plugin(name)?.[method]?.(options);
  } catch {
    /* an older shell may lack the method; the feature then stays off */
  }
}

export function hideSplash(): Promise<void> {
  return call('SplashScreen', 'hide');
}

/** Dark text on a light theme, light text on a dark theme. */
export function setStatusBarForTheme(dark: boolean): Promise<void> {
  return call('StatusBar', 'setStyle', { style: dark ? 'DARK' : 'LIGHT' });
}

/** The launcher reads this to show its error screen in the interface language. */
export function saveNativeLocale(locale: string): Promise<void> {
  return call('Preferences', 'set', { key: 'readfox.locale', value: locale });
}
