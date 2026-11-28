import { afterEach, expect, it, vi } from 'vitest';
import { confirmNativeAction } from './native-confirm';

afterEach(() => vi.unstubAllGlobals());
const options = {
  message: 'Delete this entry?',
  confirmLabel: 'Delete',
  cancelLabel: 'Cancel',
  destructive: true,
};

it('uses window.confirm on web and returns false during SSR', async () => {
  const confirm = vi.fn(() => true);
  vi.stubGlobal('navigator', { userAgent: 'Safari' });
  vi.stubGlobal('window', { confirm });
  expect(await confirmNativeAction(options)).toBe(true);
  expect(confirm).toHaveBeenCalledWith(options.message);
  vi.stubGlobal('window', undefined);
  expect(await confirmNativeAction(options)).toBe(false);
});

it.each([true, false])('dispatches to the plugin and preserves a %s answer', async (confirmed) => {
  const confirm = vi.fn().mockResolvedValue({ confirmed });
  const fallback = vi.fn();
  vi.stubGlobal('navigator', { userAgent: 'ReadfoxApp/1' });
  vi.stubGlobal('window', {
    confirm: fallback,
    Capacitor: { Plugins: { NativeActionSheet: { confirm } } },
  });
  expect(await confirmNativeAction(options)).toBe(confirmed);
  expect(confirm).toHaveBeenCalledWith(options);
  expect(fallback).not.toHaveBeenCalled();
});

it.each([
  undefined,
  { confirm: vi.fn().mockRejectedValue(new Error('missing plugin')) },
  { confirm: vi.fn().mockResolvedValue({}) },
])('falls back on older shells', async (plugin) => {
  const confirm = vi.fn(() => false);
  vi.stubGlobal('navigator', { userAgent: 'ReadfoxApp/1' });
  vi.stubGlobal('window', { confirm, Capacitor: { Plugins: { NativeActionSheet: plugin } } });
  expect(await confirmNativeAction(options)).toBe(false);
  expect(confirm).toHaveBeenCalledWith(options.message);
});
