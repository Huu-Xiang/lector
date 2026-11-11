import { test, expect } from '@playwright/test';

test.describe('public book pages', () => {
  test('the index links to a book page with its opening and a sign-up link', async ({ page }) => {
    await page.goto('/books');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.locator('a[href="/books/en/walden"]').first().click();
    await expect(page).toHaveURL(/\/books\/en\/walden$/);
    await expect(page.getByText('by Henry David Thoreau', { exact: true })).toBeVisible();
    await expect(page.getByText(/When I wrote the following pages/)).toBeVisible();
    const cover = page.getByTestId('book-cover');
    await expect(cover).toBeVisible();
    await expect
      .poll(() => cover.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await expect(page.getByTestId('book-register')).toHaveAttribute(
      'href',
      '/register?book=en%2Fwalden',
    );

    await page.getByTestId('book-try-read').click();
    await expect(page.getByTestId('book-chapter-register')).toHaveAttribute(
      'href',
      '/register?book=en%2Fwalden',
    );
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
