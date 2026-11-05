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
