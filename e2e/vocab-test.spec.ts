import { test, expect, type Browser } from '@playwright/test';
import { apiUrl } from './api';

async function loggedOutPage(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return { context, page: await context.newPage() };
}

async function finishTickingNothing(page: import('@playwright/test').Page) {
  await page.getByTestId('vocab-start').click();
  await expect(page.getByTestId('vocab-progress')).toHaveText('Page 1 of 5');
  await expect(page.getByTestId('vocab-word')).toHaveCount(13);
  for (let i = 0; i < 4; i++) await page.getByTestId('vocab-next').click();
  await expect(page.getByTestId('vocab-progress')).toHaveText('Page 5 of 5');
  await page.getByTestId('vocab-finish').click();
  await expect(page.getByTestId('vocab-result')).toBeVisible();
}

test.describe('vocabulary test', () => {
  test('works logged out, shows A1 for no ticks, recommends books, and retakes', async ({
    browser,
  }) => {
    const { context, page } = await loggedOutPage(browser);
    await page.goto('/vocab-test');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await finishTickingNothing(page);
    await expect(page.getByTestId('vocab-level')).toContainText('A1');
    await expect(page.getByTestId('vocab-estimate')).toContainText('0');
    await expect(page.getByTestId('vocab-book').first()).toHaveAttribute('href', /^\/books\/en\//);
    await expect(page.getByTestId('vocab-register')).toHaveAttribute('href', /book=en%2F/);
    await expect(page.getByTestId('vocab-continue-setup')).toHaveCount(0);

    await page.getByTestId('vocab-retake').click();
    await expect(page.getByTestId('vocab-progress')).toHaveText('Page 1 of 5');
    await context.close();
  });

  test('ticking a word toggles it and the result is saved', async ({ browser }) => {
    const { context, page } = await loggedOutPage(browser);
    await page.goto('/vocab-test');
    await page.getByTestId('vocab-start').click();
    const first = page.getByTestId('vocab-word').first();
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'false');
    for (let i = 0; i < 4; i++) await page.getByTestId('vocab-next').click();
    await page.getByTestId('vocab-finish').click();
    const saved = await page.evaluate(() => localStorage.getItem('readfox-vocab-result'));
    expect(JSON.parse(saved ?? 'null')).toMatchObject({ estimate: 0, level: 'A1' });
    await context.close();
  });

  test('from setup the result offers to continue setup', async ({ browser }) => {
    const { context, page } = await loggedOutPage(browser);
    await page.goto('/vocab-test?from=setup');
    await finishTickingNothing(page);
    await expect(page.getByTestId('vocab-continue-setup')).toHaveText('Use A1 and continue setup');
    await expect(page.getByTestId('vocab-continue-setup')).toHaveAttribute('href', '/setup');
    await context.close();
  });

  test('the books index links to the test', async ({ page }) => {
    await page.goto('/books');
    const link = page.getByTestId('books-vocab-test-link');
    await expect(link).toHaveAttribute('href', '/vocab-test');
    await link.click();
    await expect(page).toHaveURL(/\/vocab-test$/, { timeout: 30_000 });
  });

  test('the sitemap lists the test page', async ({ request }) => {
    expect(await (await request.get('/sitemap.xml')).text()).toContain('/vocab-test');
  });
  test('setup pre-selects the saved level for English only and keeps a manual pick', async ({
    browser,
  }) => {
    const { context, page } = await loggedOutPage(browser);
    await page.addInitScript(() => {
      localStorage.setItem(
        'readfox-vocab-result',
        JSON.stringify({ estimate: 3000, level: 'B1', takenAt: Date.now() }),
      );
    });
    await page.request.delete(apiUrl('/api/settings/targetLanguage'));
    await page.goto('/setup');
    await expect(page.getByTestId('setup-vocab-test-link')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('setup-native-language').selectOption('de');
    await page.getByTestId('setup-language-en').click();
    await expect(page.getByTestId('setup-level-B1')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('setup-vocab-note')).toBeVisible();

    await page.getByTestId('setup-language-es').click();
    await expect(page.getByTestId('setup-level-B1')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('setup-level-unsure')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('setup-language-en').click();
    await page.getByTestId('setup-level-A2').click();
    await expect(page.getByTestId('setup-level-A2')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('setup-level-B1')).toHaveAttribute('aria-pressed', 'false');
    await context.close();
  });
});
