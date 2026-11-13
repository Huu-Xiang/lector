import { test, expect } from '@playwright/test';

test.describe('Interface language', () => {
  test('a zh-TW browser gets the Traditional interface and can switch back to English', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      locale: 'zh-TW',
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    await page.goto('/about');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
    await expect(page.getByRole('heading', { name: '關於 Readfox' })).toBeVisible();

    await page.getByTestId('ui-language-select').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'About Readfox' })).toBeVisible();

    await page.getByTestId('ui-language-select').selectOption('zh-TW');
    await expect(page.getByRole('heading', { name: '關於 Readfox' })).toBeVisible();

    await context.close();
  });
});

test.describe('Russian interface', () => {
  test.use({ locale: 'ru-RU', storageState: { cookies: [], origins: [] } });

  test('uses Russian from the browser and keeps an explicit interface choice', async ({ page }) => {
    await page.goto('/about');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.getByRole('heading', { name: /[А-Яа-яЁё].*Readfox/ })).toBeVisible();

    const select = page.getByTestId('ui-language-select');
    await expect(select).toHaveValue('ru');
    await select.selectOption('en');
    await expect(page.getByRole('heading', { name: 'About Readfox' })).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await select.selectOption('ru');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.getByRole('heading', { name: /[А-Яа-яЁё].*Readfox/ })).toBeVisible();
  });

  test('defaults to Russian in setup and saves it when starting English', async ({ page }) => {
    await page.route('**/api/settings/nativeLanguage', (route) =>
      route.fulfill({ json: route.request().method() === 'GET' ? null : { success: true } }),
    );
    const emptyOnboarding = { progress: null, profile: null, events: [] };
    await page.route('**/api/onboarding', (route) => route.fulfill({ json: emptyOnboarding }));
    await page.route('**/api/onboarding/skip', (route) => route.fulfill({ json: emptyOnboarding }));
    await page.route('**/api/settings/dailyGoal', (route) =>
      route.fulfill({ json: { success: true } }),
    );
    await page.route('**/api/starter/seed**', (route) => route.fulfill({ json: {} }));
    await page.goto('/setup');

    await expect(page.getByTestId('setup-native-language')).toHaveValue('ru');
    await expect(page.getByTestId('setup-language-ru')).toHaveCount(0);
    await page.getByTestId('setup-language-en').click();
    const savedNative = page.waitForRequest(
      (request) =>
        request.method() === 'PUT' && request.url().endsWith('/api/settings/nativeLanguage'),
    );
    const skippedGuide = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().endsWith('/api/onboarding/skip'),
    );
    await page.getByTestId('skip-guided-onboarding').click();
    expect((await savedNative).postDataJSON()).toEqual({ value: 'ru' });
    expect((await skippedGuide).postDataJSON()).toMatchObject({ language: 'en' });
  });

  test('keeps a saved native language and allows an explicit change in setup', async ({ page }) => {
    const savedNative = Promise.withResolvers<string>();
    await page.route('**/api/settings/nativeLanguage', async (route) =>
      route.fulfill({ json: await savedNative.promise }),
    );
    await page.route('**/api/onboarding', (route) =>
      route.fulfill({ json: { progress: null, profile: null, events: [] } }),
    );
    await page.goto('/setup');

    const native = page.getByTestId('setup-native-language');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    try {
      await page.getByTestId('setup-language-en').click();
      await expect(page.getByTestId('skip-guided-onboarding')).toBeDisabled();
    } finally {
      savedNative.resolve('fr');
    }
    await expect(native).toHaveValue('fr');
    await expect(page.getByTestId('skip-guided-onboarding')).toBeEnabled();

    await native.selectOption('ja');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(native).toHaveValue('ja');
  });
});
