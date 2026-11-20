import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchBootstrap,
  peekBootstrap,
  resetBootstrapCache,
  type BootstrapPayload,
} from './bootstrap';

const samplePayload: BootstrapPayload = {
  mode: 'cloud',
  user: { id: 'user-1', email: 'reader@example.com', name: 'Reader' },
  billing: { enforced: true, accessAllowed: true, status: 'active', suspended: false },
  targetLanguage: 'fr',
};

describe('bootstrap client cache', () => {
  beforeEach(() => {
    resetBootstrapCache();
  });

  it('deduplicates concurrent calls into a single /api/bootstrap request and caches success', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify(samplePayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const [a, b, c] = await Promise.all([
      fetchBootstrap(fetcher),
      fetchBootstrap(fetcher),
      fetchBootstrap(fetcher),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('/api/bootstrap');
    expect(a).toEqual({ ok: true, data: samplePayload });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(peekBootstrap()).toEqual(samplePayload);

    // Subsequent call returns cached result without refetching
    const d = await fetchBootstrap(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(d).toEqual({ ok: true, data: samplePayload });
  });

  it('does not cache non-200 failures so retries can re-fetch', async () => {
    const fetcher = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(samplePayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const first = await fetchBootstrap(fetcher);
    expect(first).toEqual({ ok: false, status: 401 });
    expect(peekBootstrap()).toBeNull();

    const second = await fetchBootstrap(fetcher);
    expect(second).toEqual({ ok: true, data: samplePayload });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('clears cached state on resetBootstrapCache', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify(samplePayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    await fetchBootstrap(fetcher);
    expect(peekBootstrap()).toEqual(samplePayload);

    resetBootstrapCache();
    expect(peekBootstrap()).toBeNull();

    await fetchBootstrap(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
