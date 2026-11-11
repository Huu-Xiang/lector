import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  QUERY_UPDATED_EVENT,
  cachedQuery,
  clearQueryCache,
  clearTenantQueries,
  dropOtherUsersRecords,
  invalidateQueries,
  peekQuery,
  wipePersistedQueries,
  type QueryKey,
} from './query-cache';

const key = (tenant: string, language: string, scope = 'collections'): QueryKey => ({
  tenant,
  language,
  scope,
});

beforeEach(() => {
  clearQueryCache();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-13T00:00:00Z'));
});

afterEach(() => vi.useRealTimers());

describe('cachedQuery', () => {
  it('deduplicates in-flight reads and reuses the resolved value within the TTL', async () => {
    let resolve!: (value: string[]) => void;
    const loader = vi.fn(
      () =>
        new Promise<string[]>((done) => {
          resolve = done;
        }),
    );

    const first = cachedQuery(key('user-a', 'af'), loader);
    const second = cachedQuery(key('user-a', 'af'), loader);
    expect(loader).toHaveBeenCalledTimes(1);

    resolve(['book']);
    await expect(Promise.all([first, second])).resolves.toEqual([['book'], ['book']]);
    await expect(cachedQuery(key('user-a', 'af'), loader)).resolves.toEqual(['book']);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('isolates both tenant and language namespaces', async () => {
    const loader = vi.fn(async () => `value-${loader.mock.calls.length}`);

    await expect(cachedQuery(key('user-a', 'af'), loader)).resolves.toBe('value-1');
    await expect(cachedQuery(key('user-a', 'de'), loader)).resolves.toBe('value-2');
    await expect(cachedQuery(key('user-b', 'af'), loader)).resolves.toBe('value-3');
    await expect(cachedQuery(key('user-a', 'af'), loader)).resolves.toBe('value-1');
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it('bypasses caching when there is no resolved tenant', async () => {
    const loader = vi.fn(async () => 'fresh');
    await cachedQuery(null, loader);
    await cachedQuery(null, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('expires values and never caches rejected requests', async () => {
    const loader = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('recovered')
      .mockResolvedValueOnce('refreshed');

    await expect(cachedQuery(key('user-a', 'af'), loader, 100)).rejects.toThrow('offline');
    await expect(cachedQuery(key('user-a', 'af'), loader, 100)).resolves.toBe('recovered');
    vi.advanceTimersByTime(101);
    await expect(cachedQuery(key('user-a', 'af'), loader, 100)).resolves.toBe('refreshed');
  });

  it('invalidates matched scopes and prevents an in-flight read from repopulating them', async () => {
    let resolve!: (value: string) => void;
    const slow = vi.fn(() => new Promise<string>((done) => (resolve = done)));
    const queryKey = key('user-a', 'af');
    const pending = cachedQuery(queryKey, slow);

    invalidateQueries({ tenant: 'user-a', scope: 'collections' });
    resolve('stale');
    await expect(pending).resolves.toBe('stale');

    const fresh = vi.fn(async () => 'fresh');
    await expect(cachedQuery(queryKey, fresh)).resolves.toBe('fresh');
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it('can clear one tenant without evicting another', async () => {
    const loaderA = vi.fn(async () => 'a');
    const loaderB = vi.fn(async () => 'b');
    await cachedQuery(key('user-a', 'af'), loaderA);
    await cachedQuery(key('user-b', 'af'), loaderB);

    clearTenantQueries('user-a');
    await cachedQuery(key('user-a', 'af'), loaderA);
    await cachedQuery(key('user-b', 'af'), loaderB);

    expect(loaderA).toHaveBeenCalledTimes(2);
    expect(loaderB).toHaveBeenCalledTimes(1);
  });
});

describe('persisted stale-while-revalidate', () => {
  type Stored = Map<string, string>;
  let stored: Stored;
  let events: Event[];
  let pathname: string;
  let hidden: boolean;

  beforeEach(() => {
    stored = new Map();
    events = [];
    pathname = '/';
    hidden = false;
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
      location: {
        get pathname() {
          return pathname;
        },
      },
      dispatchEvent: (e: Event) => {
        events.push(e);
        return true;
      },
    };
    (globalThis as unknown as { document?: unknown }).document = {
      get hidden() {
        return hidden;
      },
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  const persisted = { persist: true } as const;

  async function rememberFromPreviousSession(k: QueryKey, value: unknown) {
    await cachedQuery(k, async () => value, persisted);
    clearQueryCache();
  }

  it('returns a value remembered from a previous session at once and refreshes once', async () => {
    await rememberFromPreviousSession(key('user-a', 'af'), ['old']);
    let resolve!: (v: string[]) => void;
    const loader = vi.fn(() => new Promise<string[]>((done) => (resolve = done)));

    expect(peekQuery(key('user-a', 'af'))).toEqual(['old']);
    await expect(cachedQuery(key('user-a', 'af'), loader, persisted)).resolves.toEqual(['old']);
    await expect(cachedQuery(key('user-a', 'af'), loader, persisted)).resolves.toEqual(['old']);
    expect(loader).toHaveBeenCalledTimes(1);

    resolve(['new']);
    await vi.runAllTimersAsync();
    expect(peekQuery(key('user-a', 'af'))).toEqual(['new']);
  });

  it('makes no request while the in-memory value is fresh', async () => {
    const loader = vi.fn(async () => 1);
    await cachedQuery(key('user-a', 'af'), loader, persisted);
    await cachedQuery(key('user-a', 'af'), loader, persisted);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('emits one update event only when the refreshed value changed', async () => {
    await rememberFromPreviousSession(key('user-a', 'af'), ['same']);
    await cachedQuery(key('user-a', 'af'), async () => ['same'], persisted);
    await vi.runAllTimersAsync();
    expect(events).toHaveLength(0);

    vi.advanceTimersByTime(30_001);
    await cachedQuery(key('user-a', 'af'), async () => ['changed'], persisted);
    await vi.runAllTimersAsync();
    expect(events).toHaveLength(1);
    expect((events[0] as CustomEvent).type).toBe(QUERY_UPDATED_EVENT);
    expect((events[0] as CustomEvent).detail).toMatchObject({
      scope: 'collections',
      tenant: 'user-a',
    });
  });

  it('keeps the remembered value when a refresh fails', async () => {
    await rememberFromPreviousSession(key('user-a', 'af'), ['kept']);
    const failing = vi.fn(async () => {
      throw new Error('502');
    });

    await expect(cachedQuery(key('user-a', 'af'), failing, persisted)).resolves.toEqual(['kept']);
    await vi.runAllTimersAsync();

    expect(peekQuery(key('user-a', 'af'))).toEqual(['kept']);
    clearQueryCache();
    expect(peekQuery(key('user-a', 'af'))).toEqual(['kept']);
    expect(events).toHaveLength(0);
  });

  it('forceFresh waits for the network even with a remembered value', async () => {
    await rememberFromPreviousSession(key('user-a', 'af'), ['old']);
    await expect(
      cachedQuery(key('user-a', 'af'), async () => ['new'], { persist: true, forceFresh: true }),
    ).resolves.toEqual(['new']);
  });

  it('keeps storage when memory is cleared on launch or a language switch', async () => {
    await cachedQuery(key('user-a', 'af'), async () => ['mine'], persisted);
    clearQueryCache();
    clearTenantQueries('user-a');
    expect(peekQuery(key('user-a', 'af'))).toEqual(['mine']);
  });

  it('wipePersistedQueries empties memory and storage', async () => {
    await cachedQuery(key('user-a', 'af'), async () => ['mine'], persisted);
    wipePersistedQueries();
    expect(peekQuery(key('user-a', 'af'))).toBeUndefined();
    expect(stored.size).toBe(0);
  });

  it('never returns another user’s record', async () => {
    await cachedQuery(key('user-a', 'af'), async () => ['a'], persisted);
    expect(peekQuery(key('user-b', 'af'))).toBeUndefined();
  });

  it('invalidation removes the record and refreshes registered keys once after 5 s', async () => {
    const loader = vi.fn(async () => `v${loader.mock.calls.length}`);
    const other = vi.fn(async () => 'other');
    await cachedQuery(key('user-a', 'af'), loader, persisted);
    await cachedQuery(key('user-a', 'af', 'vocab'), other, persisted);

    for (let i = 0; i < 10; i += 1) invalidateQueries({ tenant: 'user-a', scope: 'collections' });
    expect(peekQuery(key('user-a', 'af'))).toBeUndefined();

    await vi.advanceTimersByTimeAsync(4_999);
    expect(loader).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(other).toHaveBeenCalledTimes(1);
    expect(peekQuery(key('user-a', 'af'))).toBe('v2');
  });

  it('waits with the refresh while the reader is open or the page is hidden', async () => {
    const loader = vi.fn(async () => 'v');
    await cachedQuery(key('user-a', 'af'), loader, persisted);
    pathname = '/read/abc';
    invalidateQueries({ tenant: 'user-a', scope: 'collections' });

    await vi.advanceTimersByTimeAsync(20_000);
    expect(loader).toHaveBeenCalledTimes(1);

    pathname = '/';
    hidden = true;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(loader).toHaveBeenCalledTimes(1);

    hidden = false;
    await vi.advanceTimersByTimeAsync(5_001);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('an invalidation during a pending refresh stops it from writing memory or storage', async () => {
    await rememberFromPreviousSession(key('user-a', 'af'), ['old']);
    let resolve!: (v: string[]) => void;
    const slow = vi.fn(() => new Promise<string[]>((done) => (resolve = done)));
    await cachedQuery(key('user-a', 'af'), slow, persisted);

    invalidateQueries({ tenant: 'user-a', scope: 'collections' });
    resolve(['stale']);
    await Promise.resolve();
    await Promise.resolve();

    expect(peekQuery(key('user-a', 'af'))).toBeUndefined();
  });

  it('switching the active user drops the other user’s records', async () => {
    await cachedQuery(key('user-a', 'af'), async () => ['a'], persisted);
    await cachedQuery(key('user-b', 'af'), async () => ['b'], persisted);
    clearQueryCache();
    dropOtherUsersRecords('user-b');
    expect(peekQuery(key('user-a', 'af'))).toBeUndefined();
    expect(peekQuery(key('user-b', 'af'))).toEqual(['b']);
  });
});
