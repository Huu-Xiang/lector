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

export function hasNativeAuthentication(): boolean {
  return !!plugin('NativeAuthentication')?.open;
}

export async function openNativeAuthentication(url: string): Promise<string | null> {
  const result = (await plugin('NativeAuthentication')?.open?.({ url })) as
    | { code?: string }
    | undefined;
  return result?.code ?? null;
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

export type HapticKind = 'light' | 'success' | 'warning' | 'error';

/** A short vibration. Does nothing on the web or on a shell without the plugin. */
export function haptic(kind: HapticKind = 'light'): Promise<void> {
  if (kind === 'light') return call('Haptics', 'impact', { style: 'LIGHT' });
  return call('Haptics', 'notification', { type: kind.toUpperCase() });
}

const TAB_BAR = 'NativeTabBar';

export interface NativeTab {
  /** The page path; the plugin hands it back in `tabSelected`. */
  id: string;
  title: string;
  /** An SF Symbols name. */
  icon: string;
}

/** True inside the app when this build of the shell draws the tab bar itself. */
export function hasNativeTabBar(): boolean {
  return plugin(TAB_BAR) !== null;
}

export function configureNativeTabBar(tabs: NativeTab[], selected: string | null): Promise<void> {
  return call(TAB_BAR, 'configure', { tabs, selected });
}

/** `selected` null clears the highlight, for pages outside the tabs. */
export function selectNativeTab(selected: string | null): Promise<void> {
  return call(TAB_BAR, 'select', { selected });
}

export function setNativeTabBarVisible(visible: boolean): Promise<void> {
  return call(TAB_BAR, visible ? 'show' : 'hide');
}

/** Native bars follow the page theme; `system` lets the system setting decide again. */
export function setNativeAppearance(style: 'light' | 'dark' | 'system'): Promise<void> {
  return call(TAB_BAR, 'setAppearance', { style });
}

/** Calls `open` with the tab id the user taps. Returns a function that stops listening. */
export function onNativeTabSelected(open: (id: string) => void): () => void {
  const addListener = plugin(TAB_BAR)?.addListener;
  if (!addListener) return () => {};
  let handle: { remove?: () => unknown } | null = null;
  let stopped = false;
  // A plugin registered from Swift alone hands back the handle itself, not a promise.
  Promise.resolve()
    .then(() =>
      addListener('tabSelected', (event) => {
        const id = (event as { id?: unknown } | null)?.id;
        if (typeof id === 'string') open(id);
      }),
    )
    .then((listener) => {
      handle = listener as { remove?: () => unknown };
      if (stopped) void handle.remove?.();
    })
    .catch(() => {});
  return () => {
    stopped = true;
    void handle?.remove?.();
  };
}

export interface WidgetSnapshot {
  dueNow: number;
  newAvailable: number;
  /** ISO time of the next card that comes due, or null. */
  nextDue: string | null;
}

/** Hands the review counts to the home screen widget; null clears it after sign-out. */
export function updateReviewWidget(snapshot: WidgetSnapshot | null): Promise<void> {
  return call('ReviewWidget', 'update', snapshot ? { ...snapshot } : { clear: true });
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
