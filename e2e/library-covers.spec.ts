import { test, expect, type Locator } from '@playwright/test';
import { apiUrl } from './api';
import { switchLanguage } from './language-helpers';

const loaded = (img: Locator) =>
  expect.poll(() => img.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);

test.describe('Free library covers', () => {
  // English is offered as a language to learn only when it is not the native language.
  test.beforeEach(async ({ page }) => {
    await page.request.put(apiUrl('/api/settings/nativeLanguage'), { data: { value: 'fr' } });
  });

  test.afterEach(async ({ page }) => {
    await page.request.delete(apiUrl('/api/settings/nativeLanguage'));
    for (const slug of ['walden', 'moby-dick']) {
      await page.request.delete(apiUrl(`/api/collections/library-en-${slug}`));
    }
    await page.request.put(apiUrl('/api/settings/targetLanguage'), { data: { value: 'af' } });
  });

  test('the free books list and the library cards show the cover of each book', async ({
    page,
  }) => {
    for (const slug of ['walden', 'moby-dick']) {
      const added = await page.request.post(apiUrl('/api/library/add'), {
        data: { language: 'en', slug },
      });
      expect(added.ok()).toBe(true);
    }
    await page.goto('/');
    await switchLanguage(page, 'en', 'English');

    // Walden ships its own cover; Moby-Dick ships a painting, so the card sets the title on it.
    const walden = page.getByTestId('collection-card').filter({ hasText: 'Walden' });
    await loaded(walden.locator('img'));
    await expect(walden.getByTestId('collection-cover')).toHaveCount(0);

    const mobyDick = page.getByTestId('collection-card').filter({ hasText: 'Moby-Dick' });
    const painting = mobyDick.getByTestId('collection-cover');
    await loaded(painting.locator('img'));
    await expect(painting).toContainText('Moby-Dick');

    await page.getByTestId('free-books-btn').click();
    const booksTab = page.getByTestId('free-books-tab-books');
    if (await booksTab.count()) await booksTab.click();
    await page.getByTestId('free-books-search').fill('Thoreau');
    await loaded(page.getByTestId('free-book-walden').getByTestId('free-book-cover'));
  });

  test('a collection the reader made keeps the drawn cover', async ({ page }) => {
    const created = await page.request.post(apiUrl('/api/collections'), {
      data: { title: 'Eie Versameling', author: 'Toets' },
    });
    const { id } = (await created.json()) as { id: string };
    try {
      await page.goto('/');
      const card = page.getByTestId('collection-card').filter({ hasText: 'Eie Versameling' });
      await expect(card.getByTestId('collection-cover')).toBeVisible();
      await expect(card.locator('img')).toHaveCount(0);
    } finally {
      await page.request.delete(apiUrl(`/api/collections/${id}`));
    }
  });
});
