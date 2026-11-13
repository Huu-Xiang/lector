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
    await expect(page.getByTestId('book-chapter-register')).toHaveAttribute(
      'href',
      '/register?book=en%2Fwalden',
    );
  });

  for (const { language, level, slugs } of [
    {
      language: 'fr',
      level: 'b1',
      slugs: ['contes-du-lundi', 'lettres-de-mon-moulin', 'la-petite-fadette'],
    },
    { language: 'es', level: 'a2', slugs: ['an-elementary-spanish-reader', 'lecturas-faciles'] },
    {
      language: 'en',
      level: 'b1',
      slugs: ['the-wonderful-wizard-of-oz', 'daddy-long-legs', 'a-little-princess'],
    },
    { language: 'zh', level: 'b1', slugs: ['gushi-xin-dubo', 'yi-jian-xiao-shi', 'cong-cong'] },
    { language: 'zh', level: 'b2', slugs: ['rulin-waishi', 'bei-ying', 'tu-he-mao'] },
    {
      language: 'ko',
      level: 'b2',
      slugs: [
        'dongbaekkkot',
        'unsu-joeun-nal',
        'chilchildan-bimil',
        'jindallaekkot',
        'mannyeon-syeocheu',
        'gohyang',
      ],
    },
  ]) {
    test(`the ${language} ${level} guide links directly to its free chapter previews`, async ({
      page,
    }) => {
      const response = await page.goto(`/books/${language}/level/${level}`);
      expect(response?.ok()).toBe(true);
      const html = await response?.text();
      const featured = page.getByTestId('featured-reading');
      await expect(featured.getByRole('listitem')).toHaveCount(slugs.length);
      for (const slug of slugs) {
        const href = `/books/${language}/${slug}/read`;
        expect(html).toContain(`href="${href}"`);
        const preview = featured.locator(`a[href="${href}"]`);
        await expect(preview).toBeVisible();
        const chapter = await page.request.get(href);
        expect(chapter.ok()).toBe(true);
        const chapterHtml = await chapter.text();
        expect(chapterHtml).toContain('data-testid="book-chapter"');
        expect(chapterHtml).toContain(`lang="${language}"`);
      }
      await featured.locator(`a[href="/books/${language}/${slugs[0]}/read"]`).click();
      await expect(page.getByTestId('book-chapter')).toBeVisible();
    });
  }

  test('new beginner titles have public previews and source credits', async ({ request }) => {
    const cases = [
      {
        language: 'es',
        level: 'a1',
        slug: 'me-gusta-leer',
        source: 'https://storybookscanada.ca/stories/es/0087/',
      },
      {
        language: 'ko',
        level: 'a1',
        slug: 'baegopeun-ageo',
        source: 'https://www.storybookscanada.ca/stories/ko/0156/',
      },
    ];
    const sitemap = await (await request.get('/sitemap.xml')).text();
    for (const { language, level, slug, source } of cases) {
      const detail = `/books/${language}/${slug}`;
      const preview = `${detail}/read`;
      const list = await request.get(`/books/${language}/level/${level}`);
      expect(list.ok()).toBe(true);
      expect(await list.text()).toContain(`href="${detail}"`);
      expect(sitemap).toContain(preview);
      const chapter = await request.get(preview);
      expect(chapter.ok()).toBe(true);
      const html = await chapter.text();
      expect(html).toContain('data-testid="book-chapter"');
      expect(html).toContain(source);
      expect(html).toContain('href="https://creativecommons.org/licenses/by/3.0/"');
      const book = await request.get(detail);
      const detailHtml = await book.text();
      expect(
        detailHtml.match(/href="https:\/\/creativecommons\.org\/licenses\/by\/3\.0\/"/g),
      ).toHaveLength(2);
    }
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
    expect(crumbs?.itemListElement).toHaveLength(4);

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

  test('a language hub lists its levels and books, and an unknown language is not found', async ({
    page,
    request,
  }) => {
    const response = await page.goto('/books/fr');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.locator('a[href="/books/fr/level/b1"]').first()).toBeVisible();
    await expect(page).toHaveTitle(/Readfox/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/books\/fr$/);

    await page.goto('/books');
    await page.locator('a[href="/books/en"]').first().click();
    await expect(page).toHaveURL(/\/books\/en$/);

    expect((await request.get('/books/xx')).status()).toBe(404);
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('https://readfox.app/books/fr<');
  });

  test('book pages aim the title at search intent and link to the language hub', async ({
    page,
  }) => {
    await page.goto('/books/en/walden');
    await expect(page).toHaveTitle(/^Read Walden free.*C2 English.*\| Readfox$/);
    await expect(page.locator('a[href="/books/en"]').first()).toBeVisible();
  });
});
