import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectNativeApp,
  hideSplash,
  isNativeUserAgent,
  isPushAvailable,
  readPushPermission,
  registerForPush,
  requestPushPermission,
  readNativeFile,
  writeNativeFile,
  saveNativeLocale,
  setStatusBarForTheme,
} from './native-app';

const SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';

describe('detectNativeApp', () => {
  it('counts the app user-agent mark as the app', () => {
    expect(detectNativeApp({ userAgent: `${SAFARI} ReadfoxApp/1`, capacitorNative: false })).toBe(
      true,
    );
  });

  it('counts the Capacitor flag as the app even with a plain user agent', () => {
    expect(detectNativeApp({ userAgent: SAFARI, capacitorNative: true })).toBe(true);
  });

  it('leaves mobile Safari and desktop browsers as the web', () => {
    expect(detectNativeApp({ userAgent: SAFARI, capacitorNative: false })).toBe(false);
    expect(detectNativeApp({ userAgent: 'Mozilla/5.0 Chrome/130', capacitorNative: false })).toBe(
      false,
    );
  });
});

describe('isNativeUserAgent', () => {
  it('reads the mark from a request header value', () => {
    expect(isNativeUserAgent(`${SAFARI} ReadfoxApp/2.1`)).toBe(true);
    expect(isNativeUserAgent(SAFARI)).toBe(false);
    expect(isNativeUserAgent(null)).toBe(false);
  });
});

describe('native bridge wrappers', () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  function stubWindow(plugins: Record<string, unknown>, available: (name: string) => boolean) {
    (globalThis as { window?: unknown }).window = {
      Capacitor: {
        isNativePlatform: () => true,
        isPluginAvailable: available,
        Plugins: plugins,
      },
    };
  }

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it('do nothing outside the app', async () => {
    (globalThis as { window?: unknown }).window = undefined;
    await expect(hideSplash()).resolves.toBeUndefined();
    await expect(saveNativeLocale('zh-TW')).resolves.toBeUndefined();
  });

  it('call the plugin inside the app', async () => {
    const hide = vi.fn(async () => {});
    const set = vi.fn(async () => {});
    stubWindow({ SplashScreen: { hide }, Preferences: { set } }, () => true);
    await hideSplash();
    await saveNativeLocale('zh-TW');
    expect(hide).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ key: 'readfox.locale', value: 'zh-TW' });
  });

  it('hide a feature quietly when the shell lacks its plugin', async () => {
    const hide = vi.fn(async () => {});
    stubWindow({ SplashScreen: { hide } }, (name) => name !== 'SplashScreen');
    await expect(hideSplash()).resolves.toBeUndefined();
    expect(hide).not.toHaveBeenCalled();
  });

  it('pick the status bar style from the theme', async () => {
    const setStyle = vi.fn(async () => {});
    stubWindow({ StatusBar: { setStyle } }, () => true);
    await setStatusBarForTheme(true);
    await setStatusBarForTheme(false);
    expect(setStyle).toHaveBeenNthCalledWith(1, { style: 'DARK' });
    expect(setStyle).toHaveBeenNthCalledWith(2, { style: 'LIGHT' });
  });

  it('read and write a file in the app data folder', async () => {
    const readFile = vi.fn(async () => ({ data: '{"a":1}' }));
    const writeFile = vi.fn(async () => {});
    stubWindow({ Filesystem: { readFile, writeFile } }, () => true);
    expect(await readNativeFile('offline.json')).toBe('{"a":1}');
    await writeNativeFile('offline.json', '{}');
    expect(readFile).toHaveBeenCalledWith({
      path: 'offline.json',
      directory: 'DATA',
      encoding: 'utf8',
    });
    expect(writeFile).toHaveBeenCalledWith({
      path: 'offline.json',
      data: '{}',
      directory: 'DATA',
      encoding: 'utf8',
    });
  });

  it('read nothing outside the app or when the file is missing', async () => {
    (globalThis as { window?: unknown }).window = undefined;
    expect(await readNativeFile('offline.json')).toBeNull();
    stubWindow(
      {
        Filesystem: {
          readFile: async () => {
            throw new Error('File does not exist');
          },
        },
      },
      () => true,
    );
    expect(await readNativeFile('offline.json')).toBeNull();
  });

  describe('push notifications', () => {
    function pushPlugin(opts: { permission?: string; token?: string | null } = {}) {
      const handlers: Record<string, (event: unknown) => void> = {};
      return {
        handlers,
        plugin: {
          checkPermissions: vi.fn(async () => ({ receive: opts.permission ?? 'granted' })),
          requestPermissions: vi.fn(async () => ({ receive: opts.permission ?? 'granted' })),
          addListener: vi.fn(async (event: string, handler: (event: unknown) => void) => {
            handlers[event] = handler;
            return { remove: async () => {} };
          }),
          register: vi.fn(async () => {
            if (opts.token) handlers.registration({ value: opts.token });
            else handlers.registrationError({ error: 'no token' });
          }),
        },
      };
    }

    it('are unavailable outside the app and when the shell lacks the plugin', () => {
      (globalThis as { window?: unknown }).window = undefined;
      expect(isPushAvailable()).toBe(false);
      stubWindow({ PushNotifications: {} }, () => false);
      expect(isPushAvailable()).toBe(false);
      stubWindow({ PushNotifications: {} }, () => true);
      expect(isPushAvailable()).toBe(true);
    });

    it('ask for permission and report whether it was granted', async () => {
      const granted = pushPlugin({ permission: 'granted' });
      stubWindow({ PushNotifications: granted.plugin }, () => true);
      expect(await requestPushPermission()).toBe(true);
      expect(granted.plugin.requestPermissions).toHaveBeenCalledTimes(1);

      const denied = pushPlugin({ permission: 'denied' });
      stubWindow({ PushNotifications: denied.plugin }, () => true);
      expect(await requestPushPermission()).toBe(false);
    });

    it('read the permission without asking', async () => {
      const prompt = pushPlugin({ permission: 'prompt' });
      stubWindow({ PushNotifications: prompt.plugin }, () => true);
      expect(await readPushPermission()).toBe('prompt');
      expect(prompt.plugin.requestPermissions).not.toHaveBeenCalled();
    });

    it('register and return the device token', async () => {
      const { plugin } = pushPlugin({ token: 'abc123' });
      stubWindow({ PushNotifications: plugin }, () => true);
      expect(await registerForPush()).toBe('abc123');
      expect(plugin.register).toHaveBeenCalledTimes(1);
    });

    it('return no token when registration fails or the plugin is missing', async () => {
      const { plugin } = pushPlugin({ token: null });
      stubWindow({ PushNotifications: plugin }, () => true);
      expect(await registerForPush()).toBeNull();
      stubWindow({}, () => false);
      expect(await registerForPush()).toBeNull();
      expect(await requestPushPermission()).toBe(false);
    });
  });
});
