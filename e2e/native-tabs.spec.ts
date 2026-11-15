import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 375, height: 667 },
  userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 ReadfoxApp/1',
});

test('Me opens the hidden pages and Settings can restore an extra native tab', async ({ page }) => {
  await page.addInitScript(() => {
    type Tab = { id: string };
    const state = Object.assign(window, {
      testNativeTabs: [] as Tab[],
      selectTestTab: (_id: string) => {},
    });
    let listener: ((event: unknown) => void) | undefined;
    window.Capacitor = {
      isNativePlatform: () => true,
      isPluginAvailable: (name) => name === 'NativeTabBar',
      Plugins: {
        NativeTabBar: {
          configure: async (options) => {
            state.testNativeTabs = (options as { tabs: Tab[] }).tabs;
          },
          addListener: async (_event, callback) => {
            listener = callback;
            return {
              remove: () => {
                if (listener === callback) listener = undefined;
              },
            };
          },
          select: async () => {},
          show: async () => {},
          hide: async () => {},
        },
      },
    };
    state.selectTestTab = (id) => listener?.({ id });
  });

  const tabIds = () =>
    page.evaluate(() =>
      (window as unknown as { testNativeTabs: { id: string }[] }).testNativeTabs.map(
        (tab) => tab.id,
      ),
    );
  const selectTab = (id: string) =>
    page.evaluate(
      (id) => (window as unknown as { selectTestTab: (id: string) => void }).selectTestTab(id),
      id,
    );

  await page.goto('/me');
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'Me', exact: true }),
  ).toBeVisible();
  await expect.poll(tabIds).toEqual(['/', '/stats', '/me']);
  await page.getByRole('main').getByRole('link', { name: 'Vocab', exact: true }).click();
  await expect(page).toHaveURL('/vocab');
  await page.getByTestId('native-back').click();
  await expect(page).toHaveURL('/me');
  await page.getByRole('main').getByRole('link', { name: 'Vocabulary test', exact: true }).click();
  await expect(page).toHaveURL('/vocab-test?from=nav');
  await expect(page.getByTestId('vocab-intro')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL('/me');
  await page.getByRole('main').getByRole('link', { name: 'Journal' }).click();
  await expect(page).toHaveURL('/journal');
  await page.getByTestId('native-back').click();
  await expect(page).toHaveURL('/me');
  await page.getByRole('main').getByRole('link', { name: 'Settings' }).click();

  const extra = page.getByLabel('Extra tab');
  await expect(extra).toBeHidden();
  await page.getByText('Appearance and navigation', { exact: true }).click();
  await extra.selectOption('journal');
  await expect.poll(tabIds).toEqual(['/', '/stats', '/journal', '/me']);
  await page.reload();
  await page.getByText('Appearance and navigation', { exact: true }).click();
  await expect(extra).toHaveValue('journal');
  await expect.poll(tabIds).toContain('/journal');
  await selectTab('/journal');
  await expect(page).toHaveURL('/journal');
  await selectTab('/me');
  await expect(page).toHaveURL('/me');
  await page.getByRole('main').getByRole('link', { name: 'Settings' }).click();
  await page.getByText('Appearance and navigation', { exact: true }).click();
  await extra.selectOption('practice');
  await expect.poll(tabIds).toEqual(['/', '/stats', '/practice', '/me']);
  await selectTab('/practice');
  await expect(page).toHaveURL('/practice');
  await selectTab('/me');
  await page.getByRole('main').getByRole('link', { name: 'Settings' }).click();
  await page.getByText('Appearance and navigation', { exact: true }).click();
  await extra.selectOption('none');
  await expect.poll(tabIds).toEqual(['/', '/stats', '/me']);
});

test('iPhone settings show compact groups and expand a directly linked setting', async ({
  page,
}) => {
  await page.goto('/settings');
  const settings = page.getByTestId('iphone-settings');
  await expect(settings.getByTestId('native-language-select')).toBeHidden();
  await settings
    .locator('summary')
    .filter({ hasText: /^Languages$/ })
    .click();
  await expect(settings.getByTestId('native-language-select')).toBeVisible();
  const readingLevel = settings.getByTestId('reading-level-settings');
  await expect(readingLevel).toBeVisible();
  await expect(readingLevel.getByRole('heading', { name: 'Reading level' })).toHaveCSS(
    'font-size',
    '15px',
  );
  await expect(
    readingLevel.getByRole('heading', { name: 'Reading level' }).locator('+ p'),
  ).toHaveCSS('font-size', '13px');
  await settings
    .locator('summary')
    .filter({ hasText: /^Reading and practice$/ })
    .click();
  await expect(settings.getByTestId('native-language-select')).toBeHidden({ timeout: 2000 });
  await expect(settings.getByTestId('review-goal')).toBeVisible();
  await expect(settings.getByTestId('prose-settings').locator('h2 + p')).toHaveCSS(
    'font-size',
    '13px',
  );

  await page.goto('/settings#review-goal');
  await expect(settings.getByTestId('review-goal')).toBeVisible();
  await expect(settings.getByTestId('native-language-select')).toBeHidden();
});

test('iPad moves the same app tabs between the toolbar and the narrow layout', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ReadfoxApp/1 ReadfoxOS/18',
    });
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel' });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 });
    window.Capacitor = {
      isNativePlatform: () => true,
      isPluginAvailable: (name) => name === 'NativeTabBar',
      Plugins: {
        NativeTabBar: {
          addListener: async () => ({ remove: async () => {} }),
          configure: async () => {},
          select: async () => {},
          show: async () => {},
          hide: async () => {},
        },
      },
    };
  });

  await page.goto('/me');
  await expect(page.getByRole('heading', { name: 'Me', exact: true })).toBeVisible();
  await expect(page.getByTestId('native-chat')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-native-tabbar', '');
  await expect(page.locator('html')).toHaveAttribute('data-native-tabbar-hidden', '');
  await expect(page.locator('.app-sidebar')).toBeHidden();
  const tabs = page.getByTestId('ipad-tabs');
  await expect(page.getByRole('heading', { name: 'Me', exact: true })).toHaveCSS(
    'font-weight',
    '700',
  );
  await expect(tabs).toHaveCSS('backdrop-filter', 'none');
  await expect(tabs.getByRole('link', { name: 'Me' })).toHaveAttribute('aria-current', 'location');
  await tabs.getByRole('link', { name: 'Library' }).click();
  await expect(page).toHaveURL('/');
  await expect(tabs.getByRole('link', { name: 'Library' })).toHaveAttribute(
    'aria-current',
    'location',
  );
  await tabs.getByRole('link', { name: 'Me' }).click();
  await expect(page).toHaveURL('/me');

  await page.setViewportSize({ width: 500, height: 820 });
  await expect(tabs).toBeHidden();
  await expect(page.locator('html')).not.toHaveAttribute('data-native-tabbar-hidden');
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole('link', { name: 'Me' })).toHaveAttribute('aria-current', 'location');

  await page.getByRole('main').getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('iphone-settings')).toBeVisible();
  await page.getByTestId('native-back').click();
  await expect(page).toHaveURL('/me');
});

for (const [major, appearance] of [
  [17, 'classic'],
  [26, 'glass'],
] as const) {
  test(`iPadOS ${major} uses the matching navigation appearance`, async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.addInitScript((version) => {
      Object.defineProperty(navigator, 'userAgent', {
        value: `Mozilla/5.0 (iPad; CPU OS ${version}_0 like Mac OS X) ReadfoxApp/1`,
      });
    }, major);
    await page.goto('/me');
    await expect(page.locator('html')).toHaveAttribute('data-ios-appearance', appearance);
    const topTabs = page.getByTestId('ipad-tabs');
    if (major === 17) {
      await expect(page.getByRole('heading', { name: 'Me', exact: true })).toHaveCSS(
        'font-weight',
        '600',
      );
      await expect(topTabs).toBeHidden();
      await expect(page.locator('.native-bottom-nav')).toBeVisible();
    } else {
      await expect(topTabs).toBeVisible();
      await expect(topTabs).toHaveCSS('font-family', /^ui-rounded,/);
      await expect(topTabs).toHaveCSS('backdrop-filter', 'blur(20px) saturate(1.45)');
      await expect(page.locator('.native-bottom-nav')).toBeHidden();
    }
  });
}

test('native glass takes over the iPad tabs and releases them around sheets and resizing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) ReadfoxApp/1 ReadfoxOS/26',
    });
    let selectTab: ((event: unknown) => void) | undefined;
    let frame: unknown;
    Object.assign(window, {
      getGlassFrame: () => frame,
      tapGlassTab: (id: string) => selectTab?.({ id }),
    });
    window.Capacitor = {
      isNativePlatform: () => true,
      isPluginAvailable: (name) => name === 'NativeTabBar',
      Plugins: {
        NativeTabBar: {
          configure: async () => {},
          select: async () => {},
          show: async () => {},
          hide: async () => {},
          addListener: async (_event, callback) => {
            selectTab = callback;
            return { remove: async () => {} };
          },
          setGlassFrame: async (options) => {
            frame = options;
            return { shown: Number((options as { width?: number })?.width) > 0 };
          },
        },
      },
    };
  });

  await page.goto('/me');
  const root = page.locator('html');
  const tabs = page.getByTestId('ipad-tabs');
  await expect(root).toHaveAttribute('data-native-glass-tabs', '');
  await expect(tabs).toBeHidden();
  const reserved = await tabs.boundingBox();
  expect(reserved?.height).toBeGreaterThanOrEqual(44);

  const glassY = () =>
    page.evaluate(
      () => (window as unknown as { getGlassFrame: () => { y: number } }).getGlassFrame().y,
    );
  const beforeInset = await glassY();
  await page.locator('.native-topbar').evaluate((header) => {
    header.style.paddingTop = '34px';
  });
  await expect.poll(glassY).toBeGreaterThan(beforeInset);

  await page.evaluate(() =>
    (window as unknown as { tapGlassTab: (id: string) => void }).tapGlassTab('/'),
  );
  await expect(page).toHaveURL('/');
  await expect(root).toHaveAttribute('data-native-glass-tabs', '');

  await page.getByTestId('native-chat').click();
  await expect(page.getByTestId('chat-panel')).toBeVisible();
  await expect(root).not.toHaveAttribute('data-native-glass-tabs');
  expect(
    await page.evaluate(() =>
      (window as unknown as { getGlassFrame: () => unknown }).getGlassFrame(),
    ),
  ).toEqual({});
  await page.getByTestId('native-chat').click();
  await expect(root).toHaveAttribute('data-native-glass-tabs', '');

  await page.setViewportSize({ width: 500, height: 820 });
  await expect(root).not.toHaveAttribute('data-native-glass-tabs');
  await expect(root).not.toHaveAttribute('data-native-tabbar-hidden');
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(root).toHaveAttribute('data-native-glass-tabs', '');
});
