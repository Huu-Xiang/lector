/** `null` means the setting was never set (off); `undefined` means the read failed (unknown, so off). */
export function resolveAutoSave(value: boolean | null | undefined): boolean | null {
  if (value === undefined) return null;
  return value === true;
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

export function createRepeatLookupTracker() {
  const firstSeen = new Map<string, string>();
  const reminded = new Set<string>();

  return (word: string, occurrence: string): boolean => {
    if (reminded.has(word)) return false;
    const first = firstSeen.get(word);
    if (first === undefined) {
      firstSeen.set(word, occurrence);
      return false;
    }
    if (first === occurrence) return false;
    firstSeen.delete(word);
    reminded.add(word);
    return true;
  };
}
