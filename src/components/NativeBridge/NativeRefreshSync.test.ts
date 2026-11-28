import { describe, expect, it, vi } from 'vitest';
import { nativeRefreshAllowed } from './NativeRefreshSync';

vi.mock('@/lib/auth-client', () => ({
  isBareRoute: (path: string) => ['/setup', '/welcome', '/login', '/register'].includes(path),
}));

describe('native pull to refresh routes', () => {
  it.each(['/', '/stats', '/vocab', '/journal', '/me', '/collection/book'])(
    'enables %s',
    (path) => {
      expect(nativeRefreshAllowed(path)).toBe(true);
    },
  );
  it.each([
    '/read/lesson',
    '/practice',
    '/setup',
    '/welcome',
    '/login',
    '/register',
    '/settings',
    '/vocab-test',
    '/collection-other/book',
  ])('leaves scrolling alone on %s', (path) => {
    expect(nativeRefreshAllowed(path)).toBe(false);
  });
});
