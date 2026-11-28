import { describe, expect, it, vi } from 'vitest';
import { nativeDrillExit, registerNativeDrillExit } from './native-drill';

describe('native drill exit ownership', () => {
  it('keeps the most recent drill action when an earlier drill unmounts', () => {
    const first = vi.fn();
    const second = vi.fn();
    const removeFirst = registerNativeDrillExit(first);
    const removeSecond = registerNativeDrillExit(second);
    removeFirst();
    nativeDrillExit()?.();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    removeSecond();
    expect(nativeDrillExit()).toBeNull();
  });
  it('does not clear a newer registration that reuses the same callback', () => {
    const exit = vi.fn();
    const removeFirst = registerNativeDrillExit(exit);
    const removeSecond = registerNativeDrillExit(exit);
    removeFirst();
    expect(nativeDrillExit()).toBe(exit);
    removeSecond();
    expect(nativeDrillExit()).toBeNull();
  });
});
