import { test, expect, type Page } from '@playwright/test';
import { apiUrl } from './api';
import { switchLanguage } from './language-helpers';

async function openEnglishFreeBooks(page: Page) {
  await switchLanguage(page, 'en', 'English');
  await page.getByTestId('free-books-btn').click();
  const booksTab = page.getByTestId('free-books-tab-books');
  if (await booksTab.count()) await booksTab.click();
  await expect(page.getByTestId('free-books-search')).toBeVisible();
}

test.describe('Free books dialog search and sort', () => {
  test.afterEach(async ({ page }) => {
    await page.request.put(apiUrl('/api/settings/targetLanguage'), { data: { value: 'af' } });
  });

  test('search finds a book across levels and shows a message for no match', async ({ page }) => {
    await openEnglishFreeBooks(page);
    const list = page.getByTestId('free-books-list');

    await page.getByTestId('free-books-search').fill('Thoreau');
    await expect(list.getByTestId('free-book-walden')).toBeVisible();
    await expect(list.locator('[data-testid^="free-book-add-"]')).toHaveCount(1);
    await expect(page.getByTestId('free-books-levels')).toHaveCount(0);

    await page.getByTestId('free-books-search').fill('zzzz-no-such-book');
    await expect(page.getByTestId('free-books-no-match')).toBeVisible();
  });

  test('shortest first puts the shortest book of a level at the top', async ({ page }) => {
    await openEnglishFreeBooks(page);
    await page.getByTestId('free-books-level-C2').click();
    await page.getByTestId('free-books-sort').selectOption('short');

    const group = page.getByTestId('free-books-group-C2');
    const sizes = await group
      .locator('li p.mt-1.text-xs')
      .evaluateAll((nodes) =>
        nodes.map((node) => Number((node.textContent ?? '').split(' ')[0].replace(/\D/g, ''))),
      );
    expect(sizes.length).toBeGreaterThan(1);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });
});
