import { describe, expect, it, vi } from 'vitest';
import { BLACKLIST_UNDO_DURATION_MS, performBlacklistWithUndo } from './index';

describe('performBlacklistWithUndo', () => {
  it('captures the exact sentence id for undo with a 5000ms toast duration', async () => {
    const blacklist = vi.fn(async () => undefined);
    const unblacklist = vi.fn(async () => undefined);
    const onBlacklisted = vi.fn();
    let capturedUndo: (() => Promise<void>) | null = null;
    let capturedDuration = 0;

    await performBlacklistWithUndo('sent-1', {
      blacklist,
      unblacklist,
      notifyHidden: (onUndo, duration) => {
        capturedUndo = onUndo;
        capturedDuration = duration;
      },
      notifyUndoFailed: vi.fn(),
      notifyHideFailed: vi.fn(),
      onBlacklisted,
    });

    expect(blacklist).toHaveBeenCalledWith('sent-1');
    expect(onBlacklisted).toHaveBeenCalledTimes(1);
    expect(capturedDuration).toBe(BLACKLIST_UNDO_DURATION_MS);
    expect(capturedDuration).toBe(5000);
    expect(capturedUndo).not.toBeNull();

    await capturedUndo!();
    expect(unblacklist).toHaveBeenCalledWith('sent-1');
  });

  it('keeps each undo callback bound to its own sentence id across consecutive blacklists', async () => {
    const blacklist = vi.fn(async () => undefined);
    const unblacklist = vi.fn(async () => undefined);
    const undos: Array<() => Promise<void>> = [];

    for (const id of ['sent-a', 'sent-b']) {
      await performBlacklistWithUndo(id, {
        blacklist,
        unblacklist,
        notifyHidden: (onUndo) => {
          undos.push(onUndo);
        },
        notifyUndoFailed: vi.fn(),
        notifyHideFailed: vi.fn(),
        onBlacklisted: vi.fn(),
      });
    }

    await undos[0]();
    expect(unblacklist).toHaveBeenCalledWith('sent-a');
    await undos[1]();
    expect(unblacklist).toHaveBeenCalledWith('sent-b');
  });
});
