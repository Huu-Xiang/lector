import { expect, test } from '@playwright/test';
import { apiUrl } from './api';

declare global {
  interface Window {
    nativeSystemTest: {
      calls: Array<{ name: string; options: unknown }>;
      listeners: Record<string, (event: unknown) => void>;
      confirmed: boolean;
      scroll: ScrollToOptions | null;
    };
  }
}

test.use({
  viewport: { width: 393, height: 852 },
  userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 ReadfoxApp/1',
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state: Window['nativeSystemTest'] = {
      calls: [],
      listeners: {},
      confirmed: false,
      scroll: null,
    };
    window.nativeSystemTest = state;
    const plugin = (name: string, methods: string[]) => ({
      ...Object.fromEntries(
        methods.map((method) => [
          method,
          async (options?: unknown) => {
            state.calls.push({ name: `${name}.${method}`, options });
            return method === 'confirm' ? { confirmed: state.confirmed } : {};
          },
        ]),
      ),
      addListener: async (event: unknown, callback?: (event: unknown) => void) => {
        const key = `${name}.${event}`;
        if (callback) state.listeners[key] = callback;
        return {
          remove: () => {
            delete state.listeners[key];
          },
        };
      },
    });
    window.Capacitor = {
      isNativePlatform: () => true,
      isPluginAvailable: (name) =>
        ['NativeTabBar', 'NativeRefresh', 'NativeActionSheet'].includes(name),
      Plugins: {
        NativeTabBar: plugin('NativeTabBar', [
          'configure',
          'select',
          'show',
          'hide',
          'setBadge',
          'setAppearance',
        ]),
        NativeRefresh: plugin('NativeRefresh', ['setEnabled', 'endRefreshing']),
        NativeActionSheet: plugin('NativeActionSheet', ['confirm']),
      },
    };
  });
});

test('native refresh and reselect events reach the app and respect Reduce Motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/me');
  await expect
    .poll(() => page.evaluate(() => Object.keys(window.nativeSystemTest.listeners)))
    .toContain('NativeRefresh.refresh');
  await expect
    .poll(() => page.evaluate(() => Object.keys(window.nativeSystemTest.listeners)))
    .toContain('NativeTabBar.tabReselected');
  await page.evaluate(() => {
    window.scrollTo = ((options: ScrollToOptions) => {
      window.nativeSystemTest.scroll = options;
    }) as typeof window.scrollTo;
    window.nativeSystemTest.calls = [];
    window.nativeSystemTest.listeners['NativeTabBar.tabReselected']({ id: '/me' });
    window.nativeSystemTest.listeners['NativeRefresh.refresh']({});
  });
  await expect
    .poll(() => page.evaluate(() => window.nativeSystemTest.scroll))
    .toEqual({ top: 0, behavior: 'auto' });
  await expect
    .poll(() => page.evaluate(() => window.nativeSystemTest.calls.map((call) => call.name)))
    .toContain('NativeRefresh.endRefreshing');
  await page.goto('/practice');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.nativeSystemTest.calls
            .filter((call) => call.name === 'NativeRefresh.setEnabled')
            .at(-1)?.options,
      ),
    )
    .toEqual({ enabled: false });
});

test('native deletion cancellation preserves a collection and confirmation removes it', async ({
  page,
}) => {
  const response = await page.request.post(apiUrl('/api/collections'), {
    data: { title: 'Native confirmation test', language: 'af' },
  });
  expect(response.ok()).toBe(true);
  const { id } = await response.json();
  try {
    await page.goto(`/collection/${id}`);
    await page.getByRole('button', { name: 'Book actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.nativeSystemTest.calls.filter(
              (call) => call.name === 'NativeActionSheet.confirm',
            ).length,
        ),
      )
      .toBe(1);
    await expect(
      page.getByRole('heading', { name: 'Native confirmation test', exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      window.nativeSystemTest.confirmed = true;
    });
    await page.getByRole('button', { name: 'Book actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL('/');
    expect((await page.request.get(apiUrl(`/api/collections/${id}`))).status()).toBe(404);
  } finally {
    await page.request.delete(apiUrl(`/api/collections/${id}`));
  }
});
