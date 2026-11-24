import { expect, test } from '@playwright/test';

test.describe('multi-language vocabulary tests', () => {
  test('/vocab-test/en redirects permanently to /vocab-test and unknown languages return 404', async ({
    request,
  }) => {
    const enRedirect = await request.get('/vocab-test/en', { maxRedirects: 0 });
    expect(enRedirect.status()).toBe(308);
    expect(enRedirect.headers()['location']).toBe('/vocab-test');

    const unknown = await request.get('/vocab-test/xx');
    expect(unknown.status()).toBe(404);
  });

  for (const lang of ['fr', 'es'] as const) {
    test(`/vocab-test/${lang} serves SSR page, JSON-LD, hreflang, and static word bank`, async ({
      request,
    }) => {
      const pageRes = await request.get(`/vocab-test/${lang}`, {
        headers: { 'accept-language': '' },
      });
      expect(pageRes.status()).toBe(200);
      const html = await pageRes.text();
      expect(html).toContain(`rel="canonical" href="https://readfox.app/vocab-test/${lang}"`);
      expect(html).toContain(
        `hrefLang="zh-CN" href="https://readfox.app/zh-cn/vocab-test/${lang}"`,
      );
      expect(html).toContain('"@type":"WebApplication"');
      expect(html).toContain('"@type":"FAQPage"');

      const zhRes = await request.get(`/zh-cn/vocab-test/${lang}`, {
        headers: { 'accept-language': '' },
      });
      expect(zhRes.status()).toBe(200);
      const zhHtml = await zhRes.text();
      expect(zhHtml).toContain('<html lang="zh-CN"');
      expect(zhHtml).toContain(
        `rel="canonical" href="https://readfox.app/zh-cn/vocab-test/${lang}"`,
      );

      const wordsRes = await request.get(`/vocab-test/${lang}/words`);
      expect(wordsRes.status()).toBe(200);
      const payload = (await wordsRes.json()) as {
        answerLanguage?: string;
        bands?: Array<{ words: unknown[] }>;
      };
      expect(payload.answerLanguage).toBe('en');
      expect(payload.bands?.length).toBeGreaterThanOrEqual(15);
    });
  }

  test('French vocabulary test completes 8 questions and recommends French books', async ({
    page,
  }) => {
    await page.goto('/vocab-test/fr');
    await expect(page.getByTestId('vocab-language-tabs')).toBeVisible();
    await page.getByTestId('vocab-start').click();

    for (let i = 0; i < 8; i++) {
      const card = page.getByTestId('vocab-card');
      await expect(card).toHaveAttribute('data-state', 'asking');
      await page.getByTestId('vocab-not-sure').click();
      await expect(card).toHaveAttribute('data-state', 'feedback');
      if (i < 7) await card.click();
    }

    await page.getByTestId('vocab-finish').click();
    await expect(page.getByTestId('vocab-result')).toBeVisible();
    await expect(page.getByTestId('vocab-books')).toBeVisible();
    const firstBookHref = await page.getByTestId('vocab-book').first().getAttribute('href');
    expect(firstBookHref).toMatch(/^\/books\/fr\//);
  });
});
