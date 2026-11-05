import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectNativeApp,
  hideSplash,
  isNativeUserAgent,
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
});
