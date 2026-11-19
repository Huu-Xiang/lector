import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pathname: '/',
  mode: 'cloud' as string,
  track: vi.fn(),
  cleanups: [] as (() => void)[],
}));
vi.mock('react', () => ({
  useEffect: (fn: () => (() => void) | void) => {
    const cleanup = fn();
    if (cleanup) state.cleanups.push(cleanup);
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('next-intl', () => ({ useLocale: () => 'zh-TW' }));
vi.mock('@/lib/product-analytics', () => ({ trackProductEvent: state.track }));
vi.mock('@/lib/use-env', () => ({ useLectorMode: () => state.mode }));
vi.mock('react/jsx-runtime', () => ({
  jsx: (type: unknown) => ({ type }),
  jsxs: (type: unknown) => ({ type }),
  Fragment: Symbol('fragment'),
}));

import SourceBeacon from './index';

function stubBrowser({
  cookies = true,
  cookie = '',
  search = '',
  userAgent = 'Mozilla/5.0 Chrome/120',
  webdriver = false,
  visibilityState = 'visible',
  stored = {} as Record<string, string>,
}) {
  const jar = new Map(
    cookie
      .split('; ')
      .filter(Boolean)
      .map((pair) => pair.split('=') as [string, string]),
  );
  const storage = new Map(Object.entries(stored));
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const doc = {
    referrer: '',
    visibilityState,
    addEventListener(type: string, listener: (event: Event) => void) {
      const handlers = listeners.get(type) ?? new Set();
      handlers.add(listener);
      listeners.set(type, handlers);
    },
    removeEventListener(type: string, listener: (event: Event) => void) {
      listeners.get(type)?.delete(listener);
    },
    get cookie() {
      return [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
    },
    set cookie(value: string) {
      if (cookies) {
        const [key, content] = value.split(';')[0].split('=');
        jar.set(key, content);
      }
    },
  };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('navigator', { userAgent, webdriver, language: 'en-US' });
  vi.stubGlobal('window', {
    location: { search, hostname: 'readfox.app', protocol: 'https:' },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetchMock);
  const interact = (type = 'pointerdown', isTrusted = true) => {
    for (const listener of [...(listeners.get(type) ?? [])]) {
      listener({ isTrusted } as Event);
    }
  };
  return { fetchMock, doc, interact, storage };
}

/** SourceBeacon returns the cloud component as an element; run that component. */
function render() {
  const element = SourceBeacon() as { type: () => unknown } | null;
  element?.type();
}

describe('SourceBeacon', () => {
  beforeEach(() => {
    state.pathname = '/pricing';
    state.mode = 'cloud';
    state.track.mockClear();
  });
  afterEach(() => {
    for (const cleanup of state.cleanups.splice(0)) cleanup();
    vi.unstubAllGlobals();
  });

  it('sets attribution immediately but waits for a visible trusted interaction before counting', () => {
    const { fetchMock, doc, interact } = stubBrowser({ search: '?utm_source=google' });
    render();
    expect(doc.cookie).toContain('rf_src=google.en');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.track).not.toHaveBeenCalled();
    interact();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers['x-readfox-engaged']).toBe('1');
    expect(state.track).toHaveBeenCalledTimes(1);
  });

  it('counts the first visit once and sets the cookie', () => {
    const { fetchMock, interact } = stubBrowser({});
    render();
    render();
    interact();
    interact();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
  });

  it('counts a public entry independently of an existing attribution cookie and dedupes an immediate refresh', () => {
    const { fetchMock, interact } = stubBrowser({
      cookie: 'rf_src=google.en; rf_product=en.launch',
    });
    state.pathname = '/books/en/a-christmas-carol/read';
    render();
    render();
    interact('keydown');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.track).toHaveBeenCalledTimes(1);
    expect(state.track).toHaveBeenCalledWith(
      {
        event: 'page_view',
        feature: 'book_preview',
        language: 'en',
        publicBook: 'en/a-christmas-carol',
        source: 'google',
        browserLanguage: 'en',
        uiLanguage: 'zh-TW',
        campaign: 'launch',
      },
      { anonymous: true },
    );
    state.pathname = '/books/en';
    render();
    expect(state.track).toHaveBeenCalledTimes(2);
  });

  it('ignores synthetic activity and activity in a hidden tab', () => {
    const { fetchMock, doc, interact } = stubBrowser({ visibilityState: 'hidden' });
    render();
    interact();
    doc.visibilityState = 'visible';
    interact('visibilitychange');
    interact('pointerdown', false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.track).not.toHaveBeenCalled();
    interact('touchstart');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retains a pending first visit across a reload without recounting a returning visitor', () => {
    const { fetchMock, interact } = stubBrowser({
      cookie: 'rf_src=google.en',
      stored: { 'readfox-pending-source-visit': 'pending' },
    });
    render();
    interact('wheel');
    render();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('drops page exposure when the route unmounts before engagement', () => {
    const { fetchMock, interact } = stubBrowser({});
    render();
    for (const cleanup of state.cleanups.splice(0)) cleanup();
    interact();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.track).not.toHaveBeenCalled();
  });

  it('continues page tracking if source delivery throws synchronously', () => {
    const { fetchMock, interact } = stubBrowser({});
    fetchMock.mockImplementation(() => {
      throw new Error('fetch unavailable');
    });
    render();
    expect(interact).not.toThrow();
    expect(state.track).toHaveBeenCalledTimes(1);
  });

  it('keeps only the campaign category and displayed locale in the first-touch metadata', () => {
    const { doc } = stubBrowser({ search: '?utm_campaign=anything%40example.com' });
    render();
    expect(doc.cookie).toContain('rf_product=zh-TW.other');
    expect(doc.cookie).not.toContain('example.com');
  });

  it('skips a bot', () => {
    const { fetchMock } = stubBrowser({ userAgent: 'Googlebot/2.1' });
    render();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips an automated browser', () => {
    const { fetchMock } = stubBrowser({ webdriver: true });
    render();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips when the cookie cannot be set', () => {
    const { fetchMock } = stubBrowser({ cookies: false });
    render();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips a route inside the app', () => {
    const { fetchMock } = stubBrowser({});
    state.pathname = '/vocab';
    render();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips the login page', () => {
    const { fetchMock } = stubBrowser({});
    state.pathname = '/login';
    render();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders nothing outside cloud mode', () => {
    const { fetchMock } = stubBrowser({});
    state.mode = 'selfhost';
    expect(SourceBeacon()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
