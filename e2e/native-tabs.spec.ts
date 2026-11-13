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
  await settings
    .locator('summary')
    .filter({ hasText: /^Reading and practice$/ })
    .click();
  await expect(settings.getByTestId('native-language-select')).toBeHidden({ timeout: 2000 });
  await expect(settings.getByTestId('review-goal')).toBeVisible();

  await page.goto('/settings#review-goal');
  await expect(settings.getByTestId('review-goal')).toBeVisible();
  await expect(settings.getByTestId('native-language-select')).toBeHidden();
});
