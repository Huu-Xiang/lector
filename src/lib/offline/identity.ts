let current: string | null = null;
const waiting = new Set<(userId: string) => void>();

/** The signed-in account id, set by NativeBridge; the offline cache tags every entry with it. */
export function setOfflineUser(userId: string | null): void {
  current = userId;
  if (userId) {
    waiting.forEach((resolve) => resolve(userId));
    waiting.clear();
  }
}

export function getOfflineUser(): string | null {
  return current;
}

/** The reader can load before the session does; wait briefly for it. */
export function waitForOfflineUser(timeoutMs: number): Promise<string | null> {
  if (current) return Promise.resolve(current);
  return new Promise((resolve) => {
    const done = (userId: string | null) => {
      waiting.delete(onUser);
      resolve(userId);
    };
    const onUser = (userId: string) => done(userId);
    waiting.add(onUser);
    setTimeout(() => done(current), timeoutMs);
  });
}
