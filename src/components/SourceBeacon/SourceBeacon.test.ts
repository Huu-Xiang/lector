import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ pathname: '/', mode: 'cloud' as string }));
vi.mock('react', () => ({
  useEffect: (fn: () => void) => fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('@/lib/use-env', () => ({ useLectorMode: () => state.mode }));
vi.mock('react/jsx-runtime', () => ({
  jsx: (type: unknown) => ({ type }),
  jsxs: (type: unknown) => ({ type }),
  Fragment: Symbol('fragment'),
}));

import SourceBeacon from './index';

function stubBrowser({ cookies = true, userAgent = 'Mozilla/5.0 Chrome/120', webdriver = false }) {
  let jar = '';
  const doc = {
    referrer: '',
    get cookie() {
      return jar;
    },
    set cookie(value: string) {
      if (cookies) jar = value.split(';')[0];
    },
  };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('navigator', { userAgent, webdriver, language: 'en-US' });
  vi.stubGlobal('window', {
    location: { search: '', hostname: 'readfox.app', protocol: 'https:' },
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
  });
  afterEach(() => vi.unstubAllGlobals());

  it('counts the first visit once and sets the cookie', () => {
    const { fetchMock } = stubBrowser({});
    render();
    render();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
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
