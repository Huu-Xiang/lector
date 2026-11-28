import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearNativeMediaControls,
  endNativeRefreshing,
  onNativeMediaCommand,
  onNativeRefresh,
  onNativeTabReselected,
  setNativeRefreshEnabled,
  setNativeTabBadge,
  updateNativeMediaControls,
} from './native-app';

afterEach(() => vi.unstubAllGlobals());

function bridge(plugins: Record<string, unknown>) {
  vi.stubGlobal('navigator', { userAgent: 'ReadfoxApp/1' });
  vi.stubGlobal('window', { Capacitor: { Plugins: plugins, isNativePlatform: () => true } });
}

describe('native control bridge', () => {
  it('dispatches media, refresh and badge updates with zero clearing the badge', async () => {
    const update = vi.fn();
    const clear = vi.fn();
    const setEnabled = vi.fn();
    const endRefreshing = vi.fn();
    const setBadge = vi.fn();
    bridge({
      NativeMediaControls: { update, clear },
      NativeRefresh: { setEnabled, endRefreshing },
      NativeTabBar: { setBadge },
    });
    const info = { title: 'Chapter', playing: true, duration: 20, elapsed: 5, canSeek: true };
    await updateNativeMediaControls(info);
    await clearNativeMediaControls();
    await setNativeRefreshEnabled(true);
    await endNativeRefreshing();
    await setNativeTabBadge('/me', 3);
    await setNativeTabBadge('/me', 0);
    expect(update).toHaveBeenCalledWith(info);
    expect(clear).toHaveBeenCalledOnce();
    expect(setEnabled).toHaveBeenCalledWith({ enabled: true });
    expect(endRefreshing).toHaveBeenCalledOnce();
    expect(setBadge.mock.calls).toEqual([
      [{ id: '/me', value: '3' }],
      [{ id: '/me', value: null }],
    ]);
  });

  it('validates events and removes listeners even when disposed before registration resolves', async () => {
    const callbacks = new Map<string, (event: unknown) => void>();
    const remove = vi.fn();
    const addListener = vi.fn((event: string, callback: (event: unknown) => void) => {
      callbacks.set(event, callback);
      return { remove };
    });
    bridge({
      NativeMediaControls: { addListener },
      NativeTabBar: { addListener },
      NativeRefresh: { addListener },
    });
    const command = vi.fn();
    const reselect = vi.fn();
    const refresh = vi.fn();
    const stopMedia = onNativeMediaCommand(command);
    const stopTab = onNativeTabReselected(reselect);
    const stopRefresh = onNativeRefresh(refresh);
    await vi.waitFor(() => expect(callbacks.size).toBe(3));
    callbacks.get('mediaCommand')?.({ action: 'play' });
    callbacks.get('mediaCommand')?.({ action: 'invalid' });
    callbacks.get('tabReselected')?.({ id: '/me' });
    callbacks.get('tabReselected')?.({ id: 3 });
    callbacks.get('refresh')?.({});
    expect(command).toHaveBeenCalledExactlyOnceWith('play');
    expect(reselect).toHaveBeenCalledExactlyOnceWith('/me');
    expect(refresh).toHaveBeenCalledOnce();
    stopMedia();
    stopTab();
    stopRefresh();
    callbacks.get('mediaCommand')?.({ action: 'pause' });
    expect(command).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledTimes(3);
    const stopEarly = onNativeRefresh(refresh);
    stopEarly();
    await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(4));
  });

  it('no-ops during SSR, without plugins and when an older shell rejects a method', async () => {
    for (const plugins of [
      {},
      { NativeMediaControls: { update: vi.fn().mockRejectedValue(new Error('missing')) } },
    ]) {
      bridge(plugins);
      await expect(
        updateNativeMediaControls({ title: 'Chapter', playing: false }),
      ).resolves.toBeUndefined();
      onNativeRefresh(vi.fn())();
    }
    vi.stubGlobal('window', undefined);
    await expect(clearNativeMediaControls()).resolves.toBeUndefined();
    await expect(setNativeRefreshEnabled(false)).resolves.toBeUndefined();
    await expect(setNativeTabBadge('/me', 0)).resolves.toBeUndefined();
  });
});
