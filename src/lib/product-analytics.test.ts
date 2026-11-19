import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-base', () => ({ apiUrl: (path: string) => path, lectorMode: () => 'cloud' }));

import { trackProductEvent } from './product-analytics';

function browser() {
  const handlers = new Map<string, Set<(event: Event) => void>>();
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener(type: string, callback: (event: Event) => void) {
      const callbacks = handlers.get(type) ?? new Set();
      callbacks.add(callback);
      handlers.set(type, callbacks);
    },
    removeEventListener(type: string, callback: (event: Event) => void) {
      handlers.get(type)?.delete(callback);
    },
  });
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Safari', webdriver: false });
  vi.stubGlobal('window', {});
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    engage() {
      for (const callback of [...(handlers.get('pointerdown') ?? [])]) {
        callback({ isTrusted: true } as Event);
      }
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('product analytics client', () => {
  it('queues anonymous events until trusted activity with their original deduplication key', () => {
    const { fetchMock, engage } = browser();
    const data = { event: 'quiz_started', language: 'en' };
    trackProductEvent(data, { anonymous: true, key: 'quiz-start-1' });
    expect(fetchMock).not.toHaveBeenCalled();
    engage();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, options] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/product-analytics/public');
    expect(options.headers['x-readfox-engaged']).toBe('1');
    expect(options.credentials).toBe('omit');
    expect(JSON.parse(options.body)).toEqual({ data, key: 'quiz-start-1' });
  });

  it('sends authenticated events without waiting for anonymous engagement', () => {
    const { fetchMock } = browser();
    trackProductEvent({ event: 'reading_started', lessonId: 'lesson-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/product-analytics');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('x-readfox-engaged');
  });

  it('ignores anonymous events from an automated browser', () => {
    const { fetchMock, engage } = browser();
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Safari', webdriver: true });
    trackProductEvent({ event: 'quiz_started', language: 'en' }, { anonymous: true });
    engage();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('contains synchronous and rejected delivery failures', async () => {
    const { fetchMock, engage } = browser();
    fetchMock.mockImplementationOnce(() => {
      throw new Error('fetch unavailable');
    });
    trackProductEvent({ event: 'quiz_started', language: 'en' }, { anonymous: true });
    expect(engage).not.toThrow();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(() =>
      trackProductEvent({ event: 'reading_started', lessonId: 'lesson-1' }),
    ).not.toThrow();
    await Promise.resolve();
  });
});
