import { afterEach, describe, expect, it, vi } from 'vitest';
import { listenForAppLinks, listenForNotificationTaps } from './app-url';

const originalWindow = (globalThis as { window?: unknown }).window;

function stubApp(addListener: (name: string, handler: (e: { url?: string }) => void) => unknown) {
  (globalThis as { window?: unknown }).window = {
    Capacitor: {
      isNativePlatform: () => true,
      isPluginAvailable: () => true,
      Plugins: { App: { addListener } },
    },
  };
}

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe('listenForAppLinks', () => {
  it('opens the relative path for a listed link', () => {
    let handler: (e: { url?: string }) => void = () => {};
    stubApp(async (_name, h) => {
      handler = h;
      return { remove: vi.fn() };
    });
    const open = vi.fn();
    listenForAppLinks(open);
    handler({ url: 'https://readfox.app/api/auth/verify-email?token=abc' });
    expect(open).toHaveBeenCalledWith('/api/auth/verify-email?token=abc');
  });

  it('ignores another host, an unlisted path, and a link with no url', () => {
    let handler: (e: { url?: string }) => void = () => {};
    stubApp(async (_name, h) => {
      handler = h;
      return { remove: vi.fn() };
    });
    const open = vi.fn();
    listenForAppLinks(open);
    handler({ url: 'https://evil.example/register' });
    handler({ url: 'https://readfox.app/checkout' });
    handler({});
    expect(open).not.toHaveBeenCalled();
  });

  it('does nothing outside the app', () => {
    (globalThis as { window?: unknown }).window = undefined;
    const stop = listenForAppLinks(vi.fn());
    expect(() => stop()).not.toThrow();
  });
});

describe('listenForNotificationTaps', () => {
  function stubPush(addListener: (name: string, handler: (e: unknown) => void) => unknown) {
    (globalThis as { window?: unknown }).window = {
      Capacitor: {
        isNativePlatform: () => true,
        isPluginAvailable: () => true,
        Plugins: { PushNotifications: { addListener } },
      },
    };
  }

  it('opens the practice page when the reminder is tapped', () => {
    let handler: (e: unknown) => void = () => {};
    stubPush(async (name, h) => {
      expect(name).toBe('pushNotificationActionPerformed');
      handler = h;
      return { remove: vi.fn() };
    });
    const open = vi.fn();
    listenForNotificationTaps(open);
    handler({ notification: { data: { path: '/practice' } } });
    expect(open).toHaveBeenCalledWith('/practice');
  });

  it('ignores any other path in a notification', () => {
    let handler: (e: unknown) => void = () => {};
    stubPush(async (_name, h) => {
      handler = h;
      return { remove: vi.fn() };
    });
    const open = vi.fn();
    listenForNotificationTaps(open);
    handler({ notification: { data: { path: '/checkout' } } });
    handler({ notification: { data: { path: 'https://evil.example/' } } });
    handler({});
    expect(open).not.toHaveBeenCalled();
  });
});

describe('plugins that answer in other ways', () => {
  function stubBoth(addListener: (name: string, handler: (e: unknown) => void) => unknown) {
    (globalThis as { window?: unknown }).window = {
      Capacitor: {
        isNativePlatform: () => true,
        isPluginAvailable: () => true,
        Plugins: { App: { addListener }, PushNotifications: { addListener } },
      },
    };
  }

  it('accept a plain handle instead of a promise', () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    stubBoth((name, h) => {
      handlers[name] = h;
      return { remove: vi.fn() };
    });
    const open = vi.fn();
    expect(() => listenForAppLinks(open)).not.toThrow();
    expect(() => listenForNotificationTaps(open)).not.toThrow();
    handlers.appUrlOpen({ url: 'https://readfox.app/register' });
    handlers.pushNotificationActionPerformed({ notification: { data: { path: '/practice' } } });
    expect(open).toHaveBeenCalledWith('/register');
    expect(open).toHaveBeenCalledWith('/practice');
  });

  it('survive a plugin that throws', () => {
    stubBoth(() => {
      throw new Error('not implemented');
    });
    expect(() => listenForAppLinks(vi.fn())).not.toThrow();
    expect(() => listenForNotificationTaps(vi.fn())).not.toThrow();
  });
});
