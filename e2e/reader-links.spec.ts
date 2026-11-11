import { test, expect } from '@playwright/test';
import { apiUrl } from './api';

test.describe('Links in lesson text', () => {
  let collectionId = '';

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.route('**/api/translate', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ translation: 'stigting', partOfSpeech: 'noun' }),
      }),
    );
    await page.route('**/api/translate/gloss', (route) =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: 'stigting' }),
    );
    const created = await page.request.post(apiUrl('/api/collections'), {
      data: { title: 'Skakel Toets', language: 'af' },
    });
    collectionId = ((await created.json()) as { id: string }).id;
    await page.request.post(apiUrl(`/api/collections/${collectionId}/lessons`), {
      data: {
        title: 'Een',
        textContent:
          'Die [Stigting Metamorfose](https://example.org/stigting) werk saam. Kyk [hier](/relatief).',
      },
    });
    const lessons = (await (
      await page.request.get(apiUrl(`/api/collections/${collectionId}/lessons`))
    ).json()) as Array<{ id: string }>;
    await page.goto(`/read/${lessons[0].id}`);
    await expect(page.getByText('Metamorfose')).toBeVisible({ timeout: 10000 });
  });

  test.afterEach(async ({ page }) => {
    await page.request.delete(apiUrl(`/api/collections/${collectionId}`));
  });

  test('a word inside a link opens the word drawer and the page stays put', async ({
    page,
    context,
  }) => {
    const before = page.url();
    let opened = false;
    context.on('page', () => (opened = true));

    await page.getByRole('button', { name: 'Look up Metamorfose' }).click();
    await expect(page.getByTestId('translation-drawer')).toHaveClass(/translate-x-0/, {
      timeout: 5000,
    });
    expect(page.url()).toBe(before);
    expect(opened).toBe(false);
  });

  test('the icon after an external link keeps the address and opens it in a new tab', async ({
    page,
  }) => {
    const links = page.getByTestId('lesson-link');
    await expect(links).toHaveCount(2);
    const open = links.first().getByTestId('lesson-link-open');
    await expect(open).toHaveAttribute('href', 'https://example.org/stigting');
    await expect(open).toHaveAttribute('target', '_blank');

    // A relative address has no icon: it would lead into this site, not to the source.
    await expect(links.nth(1).getByTestId('lesson-link-open')).toHaveCount(0);
    await expect(page.locator('article a').filter({ hasText: 'Metamorfose' })).toHaveCount(0);
  });
});
