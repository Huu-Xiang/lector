import { describe, expect, it } from 'vitest';
import { createKeyedGuard, resolveAutoSave } from './auto-save-lookups';

describe('resolveAutoSave', () => {
  it('is on when the setting was never set or is true', () => {
    expect(resolveAutoSave(null)).toBe(true);
    expect(resolveAutoSave(true)).toBe(true);
  });

  it('is off when the user turned it off', () => {
    expect(resolveAutoSave(false)).toBe(false);
  });

  it('stays unknown when the read failed', () => {
    expect(resolveAutoSave(undefined)).toBeNull();
  });
});

describe('createKeyedGuard', () => {
  it('runs one task for two overlapping calls with the same key', async () => {
    const runOnce = createKeyedGuard();
    let release!: () => void;
    let runs = 0;
    const first = runOnce('word', async () => {
      runs++;
      await new Promise<void>((resolve) => (release = resolve));
    });
    const second = runOnce('word', async () => {
      runs++;
    });
    release();
    expect(await first).toBe(true);
    expect(await second).toBe(false);
    expect(runs).toBe(1);
  });

  it('lets different keys run together and a key run again after it ends', async () => {
    const runOnce = createKeyedGuard();
    let runs = 0;
    const task = async () => {
      runs++;
    };
    await Promise.all([runOnce('a', task), runOnce('b', task)]);
    await runOnce('a', task);
    expect(runs).toBe(3);
  });

  it('frees the key when the task throws', async () => {
    const runOnce = createKeyedGuard();
    await expect(
      runOnce('a', async () => {
        throw new Error('x');
      }),
    ).rejects.toThrow('x');
    expect(await runOnce('a', async () => undefined)).toBe(true);
  });
});
