import { test, expect } from '@playwright/test';

test.describe('public book pages', () => {
  test('the index links to a book page with its opening and a sign-up link', async ({ page }) => {
    await page.goto('/books');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.locator('a[href="/books/en/walden"]').first().click();
    await expect(page).toHaveURL(/\/books\/en\/walden$/);
    await expect(page.getByText('Henry David Thoreau')).toBeVisible();
    await expect(page.getByText(/When I wrote the following pages/)).toBeVisible();
    await expect(page.locator('a[href="/register"]').first()).toBeVisible();
  });

  test('an unknown book is not found', async ({ page }) => {
    const response = await page.goto('/books/en/no-such-book');
    expect(response?.status()).toBe(404);
  });

  test('the sitemap lists the book pages', async ({ request }) => {
    const body = await (await request.get('/sitemap.xml')).text();
    expect(body).toContain('/books/en/walden');
    expect(body).toContain('/books/fr/');
  });
});
