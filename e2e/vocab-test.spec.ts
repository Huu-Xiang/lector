import { test, expect, type Browser } from '@playwright/test';
import { apiUrl } from './api';

async function loggedOutPage(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return { context, page: await context.newPage() };
}

async function answerAll(page: import('@playwright/test').Page, testId: string, count: number) {
  for (let i = 0; i < count; i++) {
    const word = page.getByTestId('vocab-word');
    const before = await word.textContent();
    await page.getByTestId(testId).click();
    if (i < count - 1) await expect(word).not.toHaveText(before ?? '');
  }
}

async function finishKnowingNothing(page: import('@playwright/test').Page) {
  await page.getByTestId('vocab-start').click();
  await expect(page.getByTestId('vocab-word')).toBeVisible();
  await expect(page.getByTestId('vocab-finish')).toBeDisabled();
  await answerAll(page, 'vocab-unknown', 20);
  await expect(page.getByTestId('vocab-finish')).toBeEnabled();
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

    await finishKnowingNothing(page);
    await expect(page.getByTestId('vocab-level')).toContainText('A1');
    await expect(page.getByTestId('vocab-estimate')).toContainText('0');
    await expect(page.getByTestId('vocab-book').first()).toHaveAttribute('href', /^\/books\/en\//);
    await expect(page.getByTestId('vocab-register')).toHaveAttribute('href', /book=en%2F/);
    await expect(page.getByTestId('vocab-continue-setup')).toHaveCount(0);

    await expect(page.getByTestId('vocab-estimate')).toContainText('±');
    await expect(page.getByTestId('vocab-precision')).toContainText('20 words answered');

    await page.getByTestId('vocab-retake').click();
    await expect(page.getByTestId('vocab-answered')).toHaveText('0 answered');
    await context.close();
  });

  test('the live estimate updates after each answer, and undo takes one back', async ({
    browser,
  }) => {
    const { context, page } = await loggedOutPage(browser);
    await page.goto('/vocab-test');
    await page.getByTestId('vocab-start').click();
    await expect(page.getByTestId('vocab-live-estimate')).toContainText('until the first estimate');

    await answerAll(page, 'vocab-known', 16);
    await expect(page.getByTestId('vocab-answered')).toHaveText('16 answered');
    await expect(page.getByTestId('vocab-live-estimate')).toContainText('±');
    const word = await page.getByTestId('vocab-word').textContent();
    await page.getByTestId('vocab-known').click();
    await expect(page.getByTestId('vocab-answered')).toHaveText('17 answered');
    await page.getByTestId('vocab-undo').click();
    await expect(page.getByTestId('vocab-answered')).toHaveText('16 answered');
    await expect(page.getByTestId('vocab-word')).toHaveText(word ?? '');

    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('vocab-answered')).toHaveText('17 answered');
    await context.close();
  });

  test('the result is saved and the test can go on for a narrower range', async ({ browser }) => {
    const { context, page } = await loggedOutPage(browser);
    await page.goto('/vocab-test');
    await finishKnowingNothing(page);
    const saved = await page.evaluate(() => localStorage.getItem('readfox-vocab-result'));
    expect(JSON.parse(saved ?? 'null')).toMatchObject({ estimate: 0, level: 'A1' });

    await page.getByTestId('vocab-continue').click();
    await expect(page.getByTestId('vocab-answered')).toHaveText('20 answered');
    await answerAll(page, 'vocab-unknown', 1);
    await expect(page.getByTestId('vocab-answered')).toHaveText('21 answered');
    await context.close();
  });

  test('from setup the result offers to continue setup', async ({ browser }) => {
    const { context, page } = await loggedOutPage(browser);
    await page.goto('/vocab-test?from=setup');
    await finishKnowingNothing(page);
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
