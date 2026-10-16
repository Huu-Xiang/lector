import { test, expect } from '@playwright/test';
import { apiUrl } from './api';

test.describe('Library descriptions', () => {
  test.beforeEach(async ({ page }) => {
    const res = await page.request.post(apiUrl('/api/library/add'), {
      data: { language: 'en', slug: 'black-beauty' },
    });
    expect(res.ok()).toBe(true);
    await page.request.put(apiUrl('/api/settings/targetLanguage'), { data: { value: 'en' } });
    await page.request.put(apiUrl('/api/settings/nativeLanguage'), { data: { value: 'fr' } });
    await page.addInitScript(() => localStorage.removeItem('readfox-show-descriptions'));
  });

  test.afterEach(async ({ page }) => {
    await page.request.delete(apiUrl('/api/collections/library-en-black-beauty'));
  });

  test('a free book card shows its description, and the switch hides it', async ({ page }) => {
    await page.goto('/');
    const description = page.getByTestId('collection-description').first();
    await expect(description).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('description-toggle').first().click();
    await expect(page.getByTestId('collection-description')).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('collection-description')).toHaveCount(0);

    await page.getByTestId('description-toggle').first().click();
    await expect(page.getByTestId('collection-description').first()).toBeVisible();
  });
});
