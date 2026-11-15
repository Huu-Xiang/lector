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
    for (const slug of ['walden', 'moby-dick', 'the-wonderful-wizard-of-oz', 'the-happy-prince']) {
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

  test('reading sections with a repeated book name have distinct headings', async ({ page }) => {
    const slug = 'the-wonderful-wizard-of-oz';
    const added = await page.request.post(apiUrl('/api/library/add'), {
      data: { language: 'en', slug },
    });
    expect(added.ok()).toBe(true);
    await page.goto('/');
    await switchLanguage(page, 'en', 'English');
    await page.goto(`/collection/library-en-${slug}`);

    const headings = page.getByTestId('lesson-heading');
    await expect(headings.first()).toContainText('Dorothy lived in the midst');
    await expect(headings.nth(1)).toContainText('Three were men and one a woman');
    await headings.first().click();
    await expect(page.getByRole('heading', { name: 'Section 1', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Section 2', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Section 2', exact: true })).toBeVisible();
  });

  test('refreshes section titles from a cached list created before the fix', async ({ page }) => {
    const id = 'library-en-the-wonderful-wizard-of-oz';
    const result = await page.request.post(apiUrl('/api/library/add'), {
      data: { language: 'en', slug: 'the-wonderful-wizard-of-oz' },
    });
    expect(result.ok()).toBe(true);
    await page.goto('/');
    await switchLanguage(page, 'en', 'English');
    await page.goto(`/collection/${id}`);
    await page.getByTestId('lesson-heading').first().click();
    const section = page.getByRole('heading', { name: 'Section 1', exact: true });
    await expect(section).toBeVisible();

    const replaced = await page.evaluate((collectionId) => {
      const key = Object.keys(localStorage).find(
        (key) => key.startsWith('lector-qc:') && key.includes(`"list","${collectionId}"`),
      );
      if (!key) return false;
      const record = JSON.parse(localStorage.getItem(key)!);
      for (const lesson of record.v) delete lesson.sectionNumber;
      localStorage.setItem(key, JSON.stringify(record));
      return true;
    }, id);
    expect(replaced).toBe(true);

    await page.reload();
    await expect(section).toBeVisible();
  });

  test('keeps a source heading when later reading sections repeat its words', async ({ page }) => {
    const slug = 'the-happy-prince';
    const result = await page.request.post(apiUrl('/api/library/add'), {
      data: { language: 'en', slug },
    });
    expect(result.ok()).toBe(true);
    await page.goto('/');
    await switchLanguage(page, 'en', 'English');
    await page.goto(`/collection/library-en-${slug}`);

    const headings = page.getByTestId('lesson-heading');
    await expect(headings.first()).toHaveText('1. The Happy Prince');
    await expect(headings.nth(1)).toContainText('He passed over the river');
    await headings.first().click();
    await expect(
      page.getByRole('heading', { name: '1. The Happy Prince', exact: true }),
    ).toBeVisible();
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
