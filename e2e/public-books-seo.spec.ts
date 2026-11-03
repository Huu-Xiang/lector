import { test, expect } from '@playwright/test';

test.describe('public book landing pages', () => {
  test('a book page lists hard words and opens chapter 1 without sign-up', async ({ page }) => {
    await page.goto('/books/en/walden');
    await expect(page.getByTestId('book-hard-words').getByRole('listitem')).toHaveCount(50);

    await page.getByTestId('book-try-read').click();
    await expect(page).toHaveURL(/\/books\/en\/walden\/read$/);
    await expect(page.getByTestId('book-chapter')).toContainText(
      'When I wrote the following pages',
    );
    await expect(page.getByTestId('book-chapter-register')).toHaveAttribute('href', '/register');
  });

  test('the level chip opens the list of books at that level', async ({ page }) => {
    await page.goto('/books/en/walden');
    await page.locator('a[href="/books/en/level/c2"]').first().click();
    await expect(page).toHaveURL(/\/books\/en\/level\/c2$/);
    await expect(page.locator('a[href="/books/en/walden"]')).toBeVisible();
  });

  test('an author with several books has a page, reached from the authors list', async ({
    page,
  }) => {
    await page.goto('/books/en/authors');
    await page.locator('a[href="/books/en/author/arthur-conan-doyle"]').click();
    await expect(page.locator('a[href="/books/en/the-hound-of-the-baskervilles"]')).toBeVisible();
  });

  test('unknown levels and single-book authors are not found', async ({ request }) => {
    expect((await request.get('/books/en/level/z9')).status()).toBe(404);
    expect((await request.get('/books/en/author/henry-david-thoreau')).status()).toBe(404);
  });

  test('the sitemap lists chapter, level and author pages', async ({ request }) => {
    const body = await (await request.get('/sitemap.xml')).text();
    expect(body).toContain('/books/en/walden/read');
    expect(body).toContain('/books/fr/level/b1');
    expect(body).toContain('/books/en/authors');
    expect(body).toContain('/books/en/author/arthur-conan-doyle');
  });

  test('book and list pages carry schema.org data for search engines and AI', async ({ page }) => {
    const blocks = async () =>
      (await page.locator('script[type="application/ld+json"]').allTextContents()).map(
        (text) => JSON.parse(text) as Record<string, unknown>,
      );

    await page.goto('/books/en/walden');
    const book = await blocks();
    expect(book.find((b) => b['@type'] === 'Book')).toMatchObject({
      name: 'Walden',
      wordCount: expect.any(Number),
      timeRequired: expect.stringMatching(/^PT/),
    });
    const crumbs = book.find((b) => b['@type'] === 'BreadcrumbList');
    expect(crumbs?.itemListElement).toHaveLength(3);

    await page.goto('/books/en/level/c2');
    const list = (await blocks()).find((b) => b['@type'] === 'ItemList');
    expect(JSON.stringify(list)).toContain('https://readfox.app/books/en/walden');
  });

  test('llms.txt sums up the site and links the book pages', async ({ request }) => {
    const response = await request.get('/llms.txt');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/plain');
    const body = await response.text();
    expect(body).toMatch(/^# Readfox\n/);
    expect(body).toContain('(https://readfox.app/books/en/walden)');
  });
});
