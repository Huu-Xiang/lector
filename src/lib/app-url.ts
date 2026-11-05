import { isNativeApp } from './native-app';
import { resolveAppLink } from './universal-links';

type Listener = { remove?: () => Promise<void> | void };

/** A plugin may hand back a promise or the handle itself, and may throw; neither may crash the page. */
async function register(add: () => unknown): Promise<Listener> {
  return (await add()) as Listener;
}

/**
 * Loads the page for a link opened in the iPhone app (a Universal Link or `readfox://share`).
 * Returns a function that stops listening. Does nothing outside the app or without the App plugin.
 */
export function listenForAppLinks(open: (path: string) => void): () => void {
  if (!isNativeApp()) return () => {};
  const bridge = window.Capacitor;
  if (bridge?.isPluginAvailable?.('App') === false) return () => {};
  const addListener = bridge?.Plugins?.App?.addListener as
    | ((name: string, handler: (event: { url?: string }) => void) => Promise<Listener>)
    | undefined;
  if (!addListener) return () => {};
  let handle: Listener | null = null;
  let stopped = false;
  void register(() =>
    addListener('appUrlOpen', (event) => {
      const path = event.url ? resolveAppLink(event.url) : null;
      if (path) open(path);
    }),
  )
    .then((listener) => {
      if (stopped) void listener.remove?.();
      else handle = listener;
    })
    .catch(() => {});
  return () => {
    stopped = true;
    void handle?.remove?.();
  };
}

type TapEvent = { notification?: { data?: { path?: unknown } } };

/** The reminder notification only ever opens the practice page. */
const NOTIFICATION_PATHS = new Set(['/practice']);

/** Opens the page a tapped notification names, when it is one the app allows. */
export function listenForNotificationTaps(open: (path: string) => void): () => void {
  if (!isNativeApp()) return () => {};
  const bridge = window.Capacitor;
  if (bridge?.isPluginAvailable?.('PushNotifications') === false) return () => {};
  const addListener = bridge?.Plugins?.PushNotifications?.addListener as
    | ((name: string, handler: (event: TapEvent) => void) => Promise<Listener>)
    | undefined;
  if (!addListener) return () => {};
  let handle: Listener | null = null;
  let stopped = false;
  void register(() =>
    addListener('pushNotificationActionPerformed', (event) => {
      const path = event.notification?.data?.path;
      if (typeof path === 'string' && NOTIFICATION_PATHS.has(path)) open(path);
    }),
  )
    .then((listener) => {
      if (stopped) void listener.remove?.();
      else handle = listener;
    })
    .catch(() => {});
  return () => {
    stopped = true;
    void handle?.remove?.();
  };
}
