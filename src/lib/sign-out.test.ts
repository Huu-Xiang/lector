import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const order: string[] = [];
const signOut = vi.fn(async () => {
  order.push('signOut');
  return { data: { success: true }, error: null };
});
const clearOfflineData = vi.fn(async () => {
  await Promise.resolve();
  order.push('offline');
});

vi.mock('@/lib/auth-client', () => ({ authClient: { signOut } }));
vi.mock('./offline/sync', () => ({ clearOfflineData }));

const stored = new Map<string, string>();

beforeEach(() => {
  order.length = 0;
  stored.clear();
  signOut.mockClear();
  clearOfflineData.mockClear();
  (globalThis as unknown as { window?: unknown }).window = {
    localStorage: {
      get length() {
        return stored.size;
      },
      key: (i: number) => [...stored.keys()][i] ?? null,
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: (k: string, v: string) => void stored.set(k, v),
      removeItem: (k: string) => void stored.delete(k),
    },
  };
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('signOutAndForget', () => {
  it('removes every persisted cache record and signs out once', async () => {
    stored.set('lector-qc:a', '{}');
    stored.set('lector-qc:b', '{}');
    stored.set('lector-theme', 'dark');
    const { signOutAndForget } = await import('./sign-out');
    const result = await signOutAndForget();
    expect([...stored.keys()]).toEqual(['lector-theme']);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: { success: true }, error: null });
  });

  it('clears the offline lessons before sign-out resolves', async () => {
    const { signOutAndForget } = await import('./sign-out');
    await signOutAndForget();
    expect(clearOfflineData).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['offline', 'signOut']);
  });

  it('still signs out when the offline wipe fails', async () => {
    clearOfflineData.mockRejectedValueOnce(new Error('disk'));
    const { signOutAndForget } = await import('./sign-out');
    await signOutAndForget();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
