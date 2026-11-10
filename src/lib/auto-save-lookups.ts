/** `null` means the setting was never set (on); `undefined` means the read failed (unknown, so off). */
export function resolveAutoSave(value: boolean | null | undefined): boolean | null {
  if (value === undefined) return null;
  return value !== false;
}

/** Runs one task per key at a time; a second call for a busy key waits and does not start another. */
export function createKeyedGuard() {
  const busy = new Map<string, Promise<unknown>>();
  return async function runOnce(key: string, task: () => Promise<void>): Promise<boolean> {
    const pending = busy.get(key);
    if (pending) {
      await pending.catch(() => undefined);
      return false;
    }
    const run = task();
    busy.set(key, run);
    try {
      await run;
    } finally {
      busy.delete(key);
    }
    return true;
  };
}
