'use client';

import { useSyncExternalStore } from 'react';

type PluginMethods = Record<
  string,
  (options?: unknown, listener?: (event: unknown) => void) => Promise<unknown>
>;

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

async function callWithResult(name: string, method: string, options?: unknown): Promise<unknown> {
  try {
    return (await plugin(name)?.[method]?.(options)) ?? null;
  } catch {
    /* an older shell may lack the method; the feature then stays off */
    return null;
  }
}

async function call(name: string, method: string, options?: unknown): Promise<void> {
  await callWithResult(name, method, options);
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

/** Reads a text file from the app's private data folder; null when absent or outside the app. */
export async function readNativeFile(path: string): Promise<string | null> {
  const result = (await callWithResult('Filesystem', 'readFile', {
    path,
    directory: 'DATA',
    encoding: 'utf8',
  })) as { data?: unknown } | null;
  return typeof result?.data === 'string' ? result.data : null;
}

export async function writeNativeFile(path: string, data: string): Promise<void> {
  await call('Filesystem', 'writeFile', { path, data, directory: 'DATA', encoding: 'utf8' });
}

const PUSH = 'PushNotifications';
const PUSH_REGISTER_TIMEOUT_MS = 10_000;

/** True inside the app when this build of the shell has the push plugin. */
export function isPushAvailable(): boolean {
  return plugin(PUSH) !== null;
}

/** The notification permission: `granted`, `denied`, or `prompt` (not asked yet). */
export async function readPushPermission(): Promise<string | null> {
  const result = (await callWithResult(PUSH, 'checkPermissions')) as { receive?: string } | null;
  return result?.receive ?? null;
}

/** Shows the system prompt the first time. True when the user allows notifications. */
export async function requestPushPermission(): Promise<boolean> {
  const result = (await callWithResult(PUSH, 'requestPermissions')) as { receive?: string } | null;
  return result?.receive === 'granted';
}

/** Registers with APNs and resolves with the device token; null when it fails or times out. */
export function registerForPush(): Promise<string | null> {
  const push = plugin(PUSH);
  if (!push?.addListener || !push.register) return Promise.resolve(null);
  const { addListener, register } = push;
  return new Promise((resolve) => {
    const handles: Array<{ remove?: () => unknown }> = [];
    const done = (token: string | null) => {
      clearTimeout(timer);
      for (const handle of handles) void handle.remove?.();
      resolve(token);
    };
    const timer = setTimeout(() => done(null), PUSH_REGISTER_TIMEOUT_MS);
    const listen = async (event: string, handler: (payload: unknown) => void) => {
      handles.push((await addListener(event, handler)) as { remove?: () => unknown });
    };
    listen('registration', (payload) => {
      const value = (payload as { value?: unknown } | null)?.value;
      done(typeof value === 'string' && value ? value : null);
    })
      .then(() => listen('registrationError', () => done(null)))
      .then(() => register())
      .catch(() => done(null));
  });
}
