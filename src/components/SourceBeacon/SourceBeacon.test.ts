import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ pathname: '/', mode: 'cloud' as string, track: vi.fn() }));
vi.mock('react', () => ({
  useEffect: (fn: () => void) => fn(),
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
}) {
  const jar = new Map(
    cookie
      .split('; ')
      .filter(Boolean)
      .map((pair) => pair.split('=') as [string, string]),
  );
  const storage = new Map<string, string>();
  const doc = {
    referrer: '',
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
  return { fetchMock, doc };
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
  afterEach(() => vi.unstubAllGlobals());

  it('counts the first visit once and sets the cookie', () => {
    const { fetchMock } = stubBrowser({});
    render();
    render();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
  });

  it('counts a public entry independently of an existing attribution cookie and dedupes an immediate refresh', () => {
    const { fetchMock } = stubBrowser({ cookie: 'rf_src=google.en; rf_product=en.launch' });
    state.pathname = '/books/en/a-christmas-carol/read';
    render();
    render();
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
